import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { generateCoachReport } from "./server/ai-coach.server";

const tradeSchema = z.object({
  mode: z.enum(["sweep", "touch"]),
  timeframe: z.string(),
  side: z.enum(["long", "short"]),
  level: z.number(),
  entry: z.number(),
  exit: z.number(),
  entryTime: z.number(),
  exitTime: z.number(),
  pnl: z.number(),
  reason: z.string(),
});

export const syncPaperTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { trades: z.infer<typeof tradeSchema>[] }) => z.object({ trades: z.array(tradeSchema).max(200) }).parse(data))
  .handler(async ({ data, context }) => {
    const rows = data.trades.map((t) => ({
      user_id: context.userId,
      mode: t.mode,
      timeframe: t.timeframe,
      side: t.side,
      level: t.level,
      entry: t.entry,
      exit: t.exit,
      entry_time: new Date(t.entryTime * 1000).toISOString(),
      exit_time: new Date(t.exitTime * 1000).toISOString(),
      pnl: t.pnl,
      reason: t.reason,
    }));
    const { error } = await context.supabase
      .from("paper_trades")
      .upsert(rows, { onConflict: "user_id,mode,timeframe,entry_time,exit_time", ignoreDuplicates: true });
    if (error) throw new Error("Failed to save trades");
    return { saved: rows.length };
  });

export const getCoachReports = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("ai_coach_reports")
      .select("id, report, trade_count, created_at")
      .order("created_at", { ascending: false })
      .limit(5);
    if (error) throw new Error("Failed to load coach reports");
    return { reports: data ?? [] };
  });

const SYSTEM = `You are the built-in AI trade coach of FZ Quant Terminal, a BTCUSDT paper-trading app. You analyze the user's saved paper trades and tell them exactly what to fix to win more.

The strategy trades bounces at $10,000 BTC levels (60k, 70k, 80k...). Current rules:
- $50,000 position per trade, structure stop capped at $2,500 from entry
- Stop moves to break-even after +$2,500; TP1 takes 50% off at +$2,500; runner targets the next 10k level
- No re-entry while a position is open; a level must be left by $1,000 (clean retest) before re-arming
- Two modes: "sweep" (institutional sweep & reclaim with CVD absorption and ATR regime filter, max ATR $1,200) and "touch" (basic 10k touch)

Write a concise markdown report with these sections:
## Verdict — 2-3 sentences on overall performance
## What's working — bullet points grounded in the numbers
## What's costing you — bullet points; name the exact losing pattern (mode, side, level, exit reason, timeframe)
## Fixes to make — numbered, concrete rule tweaks referencing the actual parameters above (e.g. tighten stop cap, change TP1 distance, adjust rearm distance, ATR regime max, prefer one mode/timeframe)
## Next 5 trades — a short checklist to follow before the next entries

Be direct and specific. Use the real numbers from the data. Never invent trades that are not in the data. Keep it under 400 words.`;

interface TradeRow {
  mode: string;
  timeframe: string;
  side: string;
  level: number;
  entry: number;
  exit: number;
  entry_time: string;
  exit_time: string;
  pnl: number;
  reason: string;
}

function summarize(trades: TradeRow[]) {
  const wins = trades.filter((t) => t.pnl > 0);
  const losses = trades.filter((t) => t.pnl <= 0);
  const grossWin = wins.reduce((a, t) => a + t.pnl, 0);
  const grossLoss = Math.abs(losses.reduce((a, t) => a + t.pnl, 0));
  const by = (key: "mode" | "timeframe" | "side" | "reason" | "level") => {
    const groups = new Map<string, { n: number; wins: number; pnl: number }>();
    for (const t of trades) {
      const k = String(t[key]);
      const g = groups.get(k) ?? { n: 0, wins: 0, pnl: 0 };
      g.n += 1;
      g.wins += t.pnl > 0 ? 1 : 0;
      g.pnl += t.pnl;
      groups.set(k, g);
    }
    return [...groups.entries()]
      .map(([k, g]) => `${k}: ${g.n} trades, ${g.wins} wins, PnL $${g.pnl.toFixed(0)}`)
      .join("\n");
  };
  const recent = trades
    .slice(0, 40)
    .map((t) => `${t.exit_time.slice(0, 16)}Z | ${t.mode} ${t.timeframe} | ${t.side} @ ${t.level / 1000}k | in ${t.entry} out ${t.exit} | ${t.reason} | PnL $${t.pnl.toFixed(0)}`)
    .join("\n");
  return `TRADE COUNT: ${trades.length}
OVERALL: ${wins.length} wins / ${losses.length} losses (${((wins.length / trades.length) * 100).toFixed(1)}% win rate), total PnL $${(grossWin - grossLoss).toFixed(0)}, avg win $${wins.length ? (grossWin / wins.length).toFixed(0) : "0"}, avg loss $${losses.length ? (grossLoss / losses.length).toFixed(0) : "0"}, profit factor ${grossLoss > 0 ? (grossWin / grossLoss).toFixed(2) : "n/a"}

BY MODE:
${by("mode")}

BY TIMEFRAME:
${by("timeframe")}

BY SIDE:
${by("side")}

BY EXIT REASON:
${by("reason")}

BY LEVEL:
${by("level")}

MOST RECENT TRADES (newest first):
${recent}`;
}

export const analyzeMyTrades = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data: trades, error } = await context.supabase
      .from("paper_trades")
      .select("mode, timeframe, side, level, entry, exit, entry_time, exit_time, pnl, reason")
      .order("exit_time", { ascending: false })
      .limit(500);
    if (error) throw new Error("Failed to load your trades");
    if (!trades?.length) {
      return { report: null as string | null, tradeCount: 0, error: "No saved trades yet. Let the terminal run — once trades close they sync here automatically, then I can analyze them." };
    }
    let report: string;
    try {
      report = await generateCoachReport(getRequest(), SYSTEM, summarize(trades as TradeRow[]));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      return { report: null as string | null, tradeCount: trades.length, error: `The AI coach is unavailable right now${message ? `: ${message}` : "."} Try again in a moment.` };
    }
    await context.supabase.from("ai_coach_reports").insert({ user_id: context.userId, report, trade_count: trades.length });
    return { report, tradeCount: trades.length, error: null as string | null };
  });
