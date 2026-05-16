-- 회계 월 마감: 매장(법인)별 + 전사(All) 마감
ALTER TABLE public.accounting_periods
  ADD COLUMN IF NOT EXISTS store_scope TEXT NOT NULL DEFAULT 'All';

UPDATE public.accounting_periods SET store_scope = 'All' WHERE store_scope IS NULL OR trim(store_scope) = '';

ALTER TABLE public.accounting_periods DROP CONSTRAINT IF EXISTS accounting_periods_pkey;
ALTER TABLE public.accounting_periods
  ADD CONSTRAINT accounting_periods_pkey PRIMARY KEY (year_month, store_scope);

CREATE INDEX IF NOT EXISTS idx_accounting_periods_store_scope
  ON public.accounting_periods (store_scope, year_month DESC);

COMMENT ON COLUMN public.accounting_periods.store_scope IS '매장 store_code 또는 All(전 매장 동시 마감)';
