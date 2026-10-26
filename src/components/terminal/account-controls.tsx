import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { User } from "@supabase/supabase-js";
import { LogIn, LogOut, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function useTerminalAccount() {
  const [user, setUser] = useState<User | null>(null);
  useEffect(() => {
    let active = true;
    void supabase.auth.getSession().then(({ data }) => { if (active) setUser(data.session?.user ?? null); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => { active = false; data.subscription.unsubscribe(); };
  }, []);
  return user;
}

export function AccountControls({ user }: { user: User | null }) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [signup, setSignup] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  useEffect(() => { if (user) setOpen(false); }, [user]);
  const social = async (provider: "google" | "lovable") => {
    setBusy(true); setMessage("");
    try {
      const result = await lovable.auth.signInWithOAuth(provider, { redirect_uri: window.location.origin });
      if (result.error) setMessage(result.error.message);
    } catch { setMessage("Sign-in could not be completed. Please try again."); }
    finally { setBusy(false); }
  };
  const email = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setMessage("");
    const form = new FormData(event.currentTarget);
    const credentials = { email: String(form.get("email")), password: String(form.get("password")) };
    try {
      const result = signup
        ? await supabase.auth.signUp({ ...credentials, options: { emailRedirectTo: window.location.origin } })
        : await supabase.auth.signInWithPassword(credentials);
      if (result.error) setMessage(result.error.message);
      else if (signup && !result.data.session) setMessage("Check your email to confirm your account before signing in.");
    } catch { setMessage("Sign-in could not be completed. Please try again."); }
    finally { setBusy(false); }
  };
  const signOut = async () => {
    setBusy(true);
    await queryClient.cancelQueries(); queryClient.clear();
    const { error } = await supabase.auth.signOut();
    if (error) { setMessage(error.message); setOpen(true); }
    setBusy(false);
  };
  return <>
    {user ? <Button size="sm" variant="outline" disabled={busy} onClick={signOut} title="Sign out" className="h-7 gap-1.5 text-[11px]"><LogOut className="h-3.5 w-3.5" />Sign out</Button>
      : <Button size="sm" variant="outline" onClick={() => setOpen(true)} className="h-7 gap-1.5 text-[11px]"><LogIn className="h-3.5 w-3.5" />Sign in</Button>}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-[min(400px,calc(100%-24px))]">
        <DialogTitle>FZ Quant account</DialogTitle>
        <DialogDescription>Saved paper trades & AI coaching</DialogDescription>
        <Button variant="outline" disabled={busy} onClick={() => social("google")}>Continue with Google</Button>
        <Button variant="outline" disabled={busy} onClick={() => social("lovable")}>Continue with Lovable</Button>
        <form onSubmit={email} className="grid gap-3">
          <label className="grid gap-1 text-sm">Email<Input name="email" type="email" autoComplete="email" required /></label>
          <label className="grid gap-1 text-sm">Password<Input name="password" type="password" minLength={8} autoComplete={signup ? "new-password" : "current-password"} required /></label>
          <Button type="submit" disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}{signup ? "Create account" : "Sign in with email"}</Button>
        </form>
        {message && <p role="status" className="text-sm text-muted-foreground">{message}</p>}
        <Button variant="ghost" disabled={busy} onClick={() => { setSignup(!signup); setMessage(""); }}>{signup ? "Already have an account? Sign in" : "Create an account"}</Button>
      </DialogContent>
    </Dialog>
  </>;
}