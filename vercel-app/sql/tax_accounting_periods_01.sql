-- 세무 마감은 법인+연월. 매장 accounting_periods(운영 잠금)와 별도다.

CREATE TABLE IF NOT EXISTS public.tax_accounting_periods (
  id BIGSERIAL PRIMARY KEY,
  tax_entity_code TEXT NOT NULL,
  year_month TEXT NOT NULL,
  is_closed BOOLEAN NOT NULL DEFAULT FALSE,
  closed_at TIMESTAMPTZ NULL,
  closed_by TEXT NULL,
  unlocked_at TIMESTAMPTZ NULL,
  unlocked_by TEXT NULL,
  unlock_reason TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (tax_entity_code, year_month)
);

CREATE INDEX IF NOT EXISTS idx_tax_accounting_periods_month
  ON public.tax_accounting_periods (year_month);

ALTER TABLE public.tax_accounting_periods ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for tax_accounting_periods" ON public.tax_accounting_periods;
CREATE POLICY "Allow all for tax_accounting_periods"
  ON public.tax_accounting_periods
  FOR ALL
  USING (true)
  WITH CHECK (true);
