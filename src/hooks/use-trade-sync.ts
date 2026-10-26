import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
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
  const syncTrades = useServerFn(syncPaperTrades);
  const cursor = useRef<Record<string, { engine: EngineState; count: number; pending: boolean; failed: boolean }>>({});
  const account = useRef(userId);
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");

  useEffect(() => {
    if (account.current !== userId) { cursor.current = {}; account.current = userId; setStatus("idle"); }
    if (!userId) return;
    for (const mode of ["sweep", "touch"] as Mode[]) {
      const e = engines[mode];
      const key = `${mode}-${interval}`;
      let record = cursor.current[key];
      if (!record || record.engine !== e) { record = { engine: e, count: 0, pending: false, failed: false }; cursor.current[key] = record; }
      if (record.pending || record.failed) continue;
      const fresh = unsyncedTrades(e.trades, record.count).slice(0, 200);
      if (!fresh.length) continue;
      record.pending = true;
      setStatus("saving");
      const trades = toSyncableTrades(mode, interval, fresh);
      const activeRecord = record;
      void syncTrades({ data: { trades } }).then(() => {
        activeRecord.count += fresh.length;
        if (cursor.current[key] === activeRecord) setStatus("saved");
      }).catch(() => {
        if (cursor.current[key] !== activeRecord) return;
        activeRecord.failed = true;
        setStatus("error");
        toast.error("Could not save trades to the cloud", { description: "Your session trades are still visible locally." });
      }).finally(() => { activeRecord.pending = false; });
    }
  });
  return { status, retry: () => { for (const record of Object.values(cursor.current)) record.failed = false; setStatus("idle"); } };
}
