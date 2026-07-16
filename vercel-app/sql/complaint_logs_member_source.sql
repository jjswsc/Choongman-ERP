-- complaint_logs: 회원앱 유입·CRM 연동
ALTER TABLE complaint_logs
  ADD COLUMN IF NOT EXISTS member_id BIGINT,
  ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_complaint_logs_member_id ON complaint_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_complaint_logs_source_channel ON complaint_logs(source_channel);

COMMENT ON COLUMN complaint_logs.member_id IS '회원 CRM members.id (회원앱 접수 시)';
COMMENT ON COLUMN complaint_logs.source_channel IS '유입: member_portal, admin, staff 등';

-- Omni SaaS: tenant_id (store_code → erp_stores.tenant_id)
-- store_code 는 기존 store_name(대부분 store_code로 저장됨)에서 백필합니다.
ALTER TABLE complaint_logs
  ADD COLUMN IF NOT EXISTS tenant_id TEXT,
  ADD COLUMN IF NOT EXISTS store_code TEXT;

CREATE INDEX IF NOT EXISTS idx_complaint_logs_tenant_id ON complaint_logs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_complaint_logs_store_code ON complaint_logs(store_code);

-- 백필: store_code = store_name (현재 대부분 store_name이 store_code 형태로 저장)
UPDATE complaint_logs
SET store_code = store_name
WHERE COALESCE(NULLIF(TRIM(store_code), ''), '') = '';

-- 백필: tenant_id = erp_stores.tenant_id (store_code 기준)
DO $$
BEGIN
  IF to_regclass('public.erp_stores') IS null THEN
    RETURN;
  END IF;

  UPDATE complaint_logs cl
  SET tenant_id = es.tenant_id
  FROM public.erp_stores es
  WHERE COALESCE(NULLIF(TRIM(cl.tenant_id), ''), '') = ''
    AND COALESCE(NULLIF(TRIM(es.tenant_id), ''), '') IS NOT NULL
    AND lower(trim(COALESCE(cl.store_code, ''))) = lower(trim(COALESCE(es.store_code, '')));
END $$;
