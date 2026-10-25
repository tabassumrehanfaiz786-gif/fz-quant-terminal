import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { syncPaperTrades } from "@/lib/coach.functions";
import { toSyncableTrades, unsyncedTrades } from "@/lib/trade-sync";
import type { EngineState, Mode } from "@/lib/strategy";
import type { Interval } from "./use-terminal";

/**
 * While signed in, appends newly closed paper trades to the cloud so the
 * AI coach can learn from the full history across sessions.
 */
export function useTradeSync(engines: Record<Mode, EngineState>, interval: Interval, userId: string | null) {
  const cursor = useRef<Record<string, number>>({});

  useEffect(() => {
    if (!userId) return;
    for (const mode of ["sweep", "touch"] as Mode[]) {
      const e = engines[mode];
      const key = `${mode}-${interval}`;
      const from = cursor.current[key] ?? 0;
      const fresh = unsyncedTrades(e.trades, from);
      if (!fresh.length) continue;
      cursor.current[key] = e.trades.length;
      const trades = toSyncableTrades(mode, interval, fresh);
      void syncPaperTrades({ data: { trades } }).catch(() => {
        cursor.current[key] = from; // retry on next render
        toast.error("Could not save trades to the cloud", { description: "Your session trades are still visible locally." });
      });
    }
  });
}
