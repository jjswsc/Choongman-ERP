-- 수익/비용 마감 문서(초안/승인) 이력
CREATE TABLE IF NOT EXISTS public.income_expense_closing_runs (
  id BIGSERIAL PRIMARY KEY,
  year_month TEXT NOT NULL,
  store_scope TEXT NOT NULL DEFAULT 'All',
  status TEXT NOT NULL DEFAULT 'draft', -- draft | approved | reset
  profit_loss_account_code TEXT NOT NULL DEFAULT '3120',
  revenue_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  expense_total NUMERIC(14,2) NOT NULL DEFAULT 0,
  net_income NUMERIC(14,2) NOT NULL DEFAULT 0,
  line_count INT NOT NULL DEFAULT 0,
  payload JSONB NULL,
  journal_entry_id BIGINT NULL,
  memo TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_income_expense_closing_runs_scope
  ON public.income_expense_closing_runs (year_month, store_scope, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_income_expense_closing_runs_status
  ON public.income_expense_closing_runs (status, created_at DESC);

ALTER TABLE public.income_expense_closing_runs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for income_expense_closing_runs" ON public.income_expense_closing_runs;
CREATE POLICY "Allow all for income_expense_closing_runs"
ON public.income_expense_closing_runs
FOR ALL USING (true) WITH CHECK (true);
