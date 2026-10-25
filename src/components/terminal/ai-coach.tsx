import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { analyzeMyTrades, getCoachReports } from "@/lib/coach.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AiCoach({ userId }: { userId: string | null }) {
  const analyze = useServerFn(analyzeMyTrades);
  const fetchReports = useServerFn(getCoachReports);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: history } = useQuery({
    queryKey: ["coach-reports", userId],
    queryFn: () => fetchReports(),
    enabled: !!userId,
  });

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await analyze();
      if (res.error) setError(res.error);
      setReport(res.report);
    } catch {
      setError("The AI coach could not be reached. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  if (!userId) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center">
        <Brain className="h-6 w-6 text-primary" />
        <p className="text-muted-foreground">Sign in to save your trades and let the AI coach learn from them.</p>
      </div>
    );
  }

  const shown = report ?? history?.reports[0]?.report ?? null;
  const shownCount = report ? null : (history?.reports[0]?.trade_count ?? null);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
        <span className="text-[10px] text-muted-foreground">
          {shownCount != null ? `Last report · ${shownCount} trades` : report ? "Fresh analysis" : "Learns from your saved trades"}
        </span>
        <Button size="sm" variant="outline" disabled={busy} onClick={run} className="h-7 gap-1.5 px-2.5 text-[11px]">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
          {busy ? "Analyzing…" : "Analyze my trades"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {error && <p className="text-down">{error}</p>}
        {shown ? (
          <div className={cn("whitespace-pre-wrap leading-relaxed [&_h2]:mt-3 [&_h2]:text-primary")}>{shown}</div>
        ) : (
          !error && <p className="text-muted-foreground">Press “Analyze my trades” — the coach reviews every saved trade and tells you what to fix to win more.</p>
        )}
      </div>
    </div>
  );
}
