import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { playChime } from "@/lib/alerts";
import type { EngineState } from "@/lib/strategy";

/**
 * Fires a toast + chime for each new ENTRY / PARTIAL / EXIT audit event.
 * The historical replay batch is marked as seen on first sight of an engine,
 * so only live events alert.
 */
export function useTradeAlerts(engine: EngineState, muted: boolean) {
  const seen = useRef<{ engine: EngineState; count: number }>({ engine, count: -1 });

  useEffect(() => {
    if (seen.current.engine !== engine) {
      seen.current = { engine, count: engine.audit.length };
      return;
    }
    const fresh = engine.audit.slice(seen.current.count);
    seen.current.count = engine.audit.length;
    for (const a of fresh) {
      if (a.kind === "ENTRY") {
        toast.success("Trade opened", { description: a.message });
        if (!muted) playChime("entry");
      } else if (a.kind === "PARTIAL") {
        toast.success("TP1 partial taken", { description: a.message });
        if (!muted) playChime("partial");
      } else if (a.kind === "EXIT") {
        const loss = /PnL -/.test(a.message);
        if (loss) toast.error("Trade closed at a loss", { description: a.message });
        else toast.success("Trade closed", { description: a.message });
        if (!muted) playChime(loss ? "loss" : "win");
      }
    }
  });
}
