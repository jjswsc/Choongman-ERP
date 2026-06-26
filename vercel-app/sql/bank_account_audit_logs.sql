-- 통장(계좌) 생성·수정·삭제 감사 로그 — Supabase SQL Editor에서 1회 실행
-- 삭제자 추적: bank_account_audit_logs.action_type = 'delete'

CREATE TABLE IF NOT EXISTS public.bank_account_audit_logs (
  id BIGSERIAL PRIMARY KEY,
  action_type TEXT NOT NULL,
  decision TEXT NOT NULL CHECK (decision IN ('allow', 'deny', 'error')),
  reason_code TEXT NULL,
  account_id BIGINT NULL,
  account_store TEXT NULL,
  account_name TEXT NULL,
  bank_name TEXT NULL,
  actor_name TEXT NULL,
  actor_role TEXT NULL,
  actor_store TEXT NULL,
  actor_employee_id BIGINT NULL,
  actor_employee_code TEXT NULL,
  payload JSONB NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_account_audit_created
  ON public.bank_account_audit_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_account_audit_account_id
  ON public.bank_account_audit_logs (account_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_bank_account_audit_store
  ON public.bank_account_audit_logs (account_store, created_at DESC);

ALTER TABLE public.bank_account_audit_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all bank_account_audit_logs" ON public.bank_account_audit_logs;
CREATE POLICY "Allow all bank_account_audit_logs" ON public.bank_account_audit_logs
  FOR ALL USING (true) WITH CHECK (true);

COMMENT ON TABLE public.bank_account_audit_logs IS '통장 계좌 생성·수정·삭제 감사 (삭제자·시각·스냅샷)';

-- 조회 예: 매장별 삭제·등록 이력
-- SELECT created_at, action_type, decision, account_store, account_name, bank_name,
--        actor_name, actor_role, actor_store, actor_employee_code, payload
-- FROM public.bank_account_audit_logs
-- WHERE account_store ILIKE '%Huamak%'
-- ORDER BY created_at DESC
-- LIMIT 50;
