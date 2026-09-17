-- 휴가 승인자 (전체 / 매장)
-- 적용: Supabase SQL Editor → 이 파일만 복사 → Run
-- Omni·충만 공통. tenant_id 는 Omni SaaS 격리용(충만은 NULL 가능).

BEGIN;

CREATE TABLE IF NOT EXISTS public.leave_approvers (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  employee_id BIGINT NOT NULL REFERENCES public.employees (id) ON DELETE CASCADE,
  scope TEXT NOT NULL,
  store TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by TEXT
);

ALTER TABLE public.leave_approvers ADD COLUMN IF NOT EXISTS tenant_id TEXT;
ALTER TABLE public.leave_approvers ADD COLUMN IF NOT EXISTS employee_id BIGINT;
ALTER TABLE public.leave_approvers ADD COLUMN IF NOT EXISTS scope TEXT;
ALTER TABLE public.leave_approvers ADD COLUMN IF NOT EXISTS store TEXT;
ALTER TABLE public.leave_approvers ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ;
ALTER TABLE public.leave_approvers ALTER COLUMN created_at SET DEFAULT NOW();
ALTER TABLE public.leave_approvers ADD COLUMN IF NOT EXISTS updated_by TEXT;

DO $$
BEGIN
  ALTER TABLE public.leave_approvers
    DROP CONSTRAINT IF EXISTS leave_approvers_scope_chk;
  ALTER TABLE public.leave_approvers
    ADD CONSTRAINT leave_approvers_scope_chk
    CHECK (scope IN ('all', 'store'));
EXCEPTION WHEN others THEN
  RAISE NOTICE 'leave_approvers_scope_chk: %', SQLERRM;
END $$;

DO $$
BEGIN
  ALTER TABLE public.leave_approvers
    DROP CONSTRAINT IF EXISTS leave_approvers_store_chk;
  ALTER TABLE public.leave_approvers
    ADD CONSTRAINT leave_approvers_store_chk
    CHECK (
      (scope = 'all' AND store IS NULL)
      OR (scope = 'store' AND store IS NOT NULL AND btrim(store) <> '')
    );
EXCEPTION WHEN others THEN
  RAISE NOTICE 'leave_approvers_store_chk: %', SQLERRM;
END $$;

CREATE INDEX IF NOT EXISTS idx_leave_approvers_tenant_id
  ON public.leave_approvers (tenant_id);

CREATE INDEX IF NOT EXISTS idx_leave_approvers_employee_id
  ON public.leave_approvers (employee_id);

CREATE INDEX IF NOT EXISTS idx_leave_approvers_store
  ON public.leave_approvers (store)
  WHERE scope = 'store';

DO $$
BEGIN
  EXECUTE $idx$
    CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_approvers_all
      ON public.leave_approvers (coalesce(tenant_id, ''), employee_id)
      WHERE scope = 'all'
  $idx$;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'ux_leave_approvers_all skipped: %', SQLERRM;
END $$;

DO $$
BEGIN
  EXECUTE $idx$
    CREATE UNIQUE INDEX IF NOT EXISTS ux_leave_approvers_store
      ON public.leave_approvers (coalesce(tenant_id, ''), employee_id, lower(btrim(store)))
      WHERE scope = 'store' AND store IS NOT NULL
  $idx$;
EXCEPTION WHEN others THEN
  RAISE NOTICE 'ux_leave_approvers_store skipped: %', SQLERRM;
END $$;

COMMENT ON TABLE public.leave_approvers IS
  '휴가 승인자. scope=all 전체 매장, scope=store 해당 매장만. 매장에 store 행이 없으면 점장/가맹점주 폴백.';

ALTER TABLE public.leave_approvers ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leave_approvers TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.leave_approvers TO postgres;

DO $$
BEGIN
  IF to_regclass('public.leave_approvers_id_seq') IS NOT NULL THEN
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.leave_approvers_id_seq TO service_role';
    EXECUTE 'GRANT USAGE, SELECT ON SEQUENCE public.leave_approvers_id_seq TO postgres';
  END IF;
END $$;

COMMIT;

NOTIFY pgrst, 'reload schema';
