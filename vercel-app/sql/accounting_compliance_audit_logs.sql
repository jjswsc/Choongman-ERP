-- 회계 컴플라이언스 권한/확정 감사 로그
CREATE TABLE IF NOT EXISTS public.accounting_compliance_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  user_role TEXT NOT NULL,
  actor TEXT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'error')),
  reason_code TEXT NULL,
  year_month TEXT NULL,
  period_type TEXT NULL,
  period_key TEXT NULL,
  store_scope TEXT NULL,
  filing_type TEXT NULL,
  target_type TEXT NULL,
  target_id TEXT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_accounting_compliance_audit_created
  ON public.accounting_compliance_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_compliance_audit_action
  ON public.accounting_compliance_audit_logs (action_type, decision, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_accounting_compliance_audit_period
  ON public.accounting_compliance_audit_logs (year_month, period_type, period_key, store_scope);

ALTER TABLE public.accounting_compliance_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all accounting_compliance_audit_logs" ON public.accounting_compliance_audit_logs;
CREATE POLICY "Allow all accounting_compliance_audit_logs"
ON public.accounting_compliance_audit_logs
FOR ALL USING (true) WITH CHECK (true);
