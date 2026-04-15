-- 세무 신고 워크플로 기간 키 정규화
-- monthly / half_year / annual + period_key 도입

DO $$
BEGIN
  IF to_regclass('public.accounting_filing_workflow_status') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status ADD COLUMN IF NOT EXISTS period_type text NOT NULL DEFAULT ''monthly''';
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status ADD COLUMN IF NOT EXISTS period_key text NOT NULL DEFAULT ''''';
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status ADD COLUMN IF NOT EXISTS store_scope text NOT NULL DEFAULT ''*''';
  ELSE
    RAISE NOTICE 'accounting_filing_workflow_status not found; skip period key migration';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.accounting_filing_workflow_status') IS NOT NULL THEN
    EXECUTE 'UPDATE public.accounting_filing_workflow_status SET period_type = ''monthly'' WHERE COALESCE(period_type, '''') = ''''';
    EXECUTE 'UPDATE public.accounting_filing_workflow_status SET period_key = year_month WHERE COALESCE(period_key, '''') = ''''';
  END IF;
END $$;

DO $$
BEGIN
  IF to_regclass('public.accounting_filing_workflow_status') IS NOT NULL THEN
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status DROP CONSTRAINT IF EXISTS accounting_filing_workflow_status_year_month_filing_type_key';
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status DROP CONSTRAINT IF EXISTS accounting_filing_workflow_status_period_ck';
    EXECUTE 'ALTER TABLE public.accounting_filing_workflow_status ADD CONSTRAINT accounting_filing_workflow_status_period_ck CHECK (period_type IN (''monthly'', ''half_year'', ''annual''))';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_filing_workflow_period_scope
  ON public.accounting_filing_workflow_status (period_type, period_key, filing_type, store_scope);

CREATE INDEX IF NOT EXISTS idx_accounting_filing_workflow_period
  ON public.accounting_filing_workflow_status (period_type, period_key);
