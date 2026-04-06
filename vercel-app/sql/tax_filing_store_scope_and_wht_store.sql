-- 세무 신고: 통합 진행관리 매장별 추적 + 원천징수 원장 매장 속성
-- Supabase SQL Editor 등에서 서비스 DB에 적용 후 배포.

-- 1) 통합 진행: (year_month, filing_type) → (year_month, filing_type, store_scope)
--    store_scope '*' = 전사(기존 데이터와 동일 의미)
ALTER TABLE public.accounting_filing_workflow_status
  ADD COLUMN IF NOT EXISTS store_scope text NOT NULL DEFAULT '*';

ALTER TABLE public.accounting_filing_workflow_status
  DROP CONSTRAINT IF EXISTS accounting_filing_workflow_status_year_month_filing_type_key;

CREATE UNIQUE INDEX IF NOT EXISTS uq_accounting_filing_workflow_ym_type_store
  ON public.accounting_filing_workflow_status (year_month, filing_type, store_scope);

-- 2) 원천징수 원장: 매장 필터·집계용 (nullable)
ALTER TABLE public.withholding_tax_ledger_entries
  ADD COLUMN IF NOT EXISTS store_name text NULL;

CREATE INDEX IF NOT EXISTS idx_wht_ledger_tax_month_store
  ON public.withholding_tax_ledger_entries (tax_month, store_name);
