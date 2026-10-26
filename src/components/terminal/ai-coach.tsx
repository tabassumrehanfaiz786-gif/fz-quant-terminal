import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import { useServerFn } from "@tanstack/react-start";
import { Brain, Loader2, Sparkles } from "lucide-react";
import { analyzeMyTrades, getCoachReports } from "@/lib/coach.functions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function AiCoach({ userId, syncStatus }: { userId: string | null; syncStatus: { status: "idle" | "saving" | "saved" | "error"; retry: () => void } }) {
  const queryClient = useQueryClient();
  const analyze = useServerFn(analyzeMyTrades);
  const fetchReports = useServerFn(getCoachReports);
  const [report, setReport] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const { data: history, isError, isPending, refetch } = useQuery({
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
      if (res.report) await queryClient.invalidateQueries({ queryKey: ["coach-reports", userId] });
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
        <Button size="sm" variant="outline" disabled={busy || syncStatus.status === "saving" || syncStatus.status === "error"} onClick={run} className="h-7 gap-1.5 px-2.5 text-[11px]">
          {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5 text-primary" />}
          {busy ? "Analyzing…" : "Analyze my trades"}
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        <p className="mb-2 text-[10px] text-muted-foreground">Paper simulation, including loaded candle replays · Suggestions only; strategy rules stay unchanged. No guaranteed wins.</p>
        {syncStatus.status === "saving" && <p role="status" className="mb-2 text-muted-foreground">Saving trades…</p>}
        {syncStatus.status === "error" && <div role="alert" className="mb-2 text-down">Trades not saved. <Button variant="outline" size="sm" onClick={syncStatus.retry}>Retry saving</Button></div>}
        {isError && <div role="alert" className="mb-2 text-down">Could not load saved reports. <Button variant="outline" size="sm" onClick={() => refetch()}>Retry</Button></div>}
        {error && <p className="text-down">{error}</p>}
        {shown ? (
          <div className={cn("break-words leading-relaxed [&_h2]:mb-1 [&_h2]:mt-3 [&_h2]:font-semibold [&_h2]:text-primary [&_ul]:list-disc [&_ul]:pl-4 [&_ol]:list-decimal [&_ol]:pl-4 [&_p]:mb-2")}><ReactMarkdown>{shown}</ReactMarkdown></div>
        ) : (
          !error && <p className="text-muted-foreground">{isPending ? "Loading saved reports…" : "No analysis yet."}</p>
        )}
      </div>
    </div>
  );
}
