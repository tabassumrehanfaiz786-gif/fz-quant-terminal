CREATE TABLE public.paper_trades (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mode text NOT NULL,
  timeframe text NOT NULL,
  side text NOT NULL,
  level numeric NOT NULL,
  entry numeric NOT NULL,
  exit numeric NOT NULL,
  entry_time timestamptz NOT NULL,
  exit_time timestamptz NOT NULL,
  pnl numeric NOT NULL,
  reason text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, mode, timeframe, entry_time, exit_time)
);
GRANT SELECT, INSERT, DELETE ON public.paper_trades TO authenticated;
GRANT ALL ON public.paper_trades TO service_role;
ALTER TABLE public.paper_trades ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own trades" ON public.paper_trades FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own trades" ON public.paper_trades FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own trades" ON public.paper_trades FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.ai_coach_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  report text NOT NULL,
  trade_count integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT ON public.ai_coach_reports TO authenticated;
GRANT ALL ON public.ai_coach_reports TO service_role;
ALTER TABLE public.ai_coach_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own reports" ON public.ai_coach_reports FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users insert own reports" ON public.ai_coach_reports FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);