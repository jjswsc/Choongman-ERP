-- Omni: employees.tenant_id (직원 저장 시 「tenant_id 스키마가 없습니다」)
-- 프로젝트: Omni Supabase SQL Editor에서만 실행.
-- 충만(레거시) DB는 이미 있을 수 있음. ADD COLUMN IF NOT EXISTS 안전.

DO $$
BEGIN
  IF to_regclass('public.employees') IS NULL THEN
    RAISE NOTICE 'skip: public.employees not found';
    RETURN;
  END IF;

  ALTER TABLE public.employees
    ADD COLUMN IF NOT EXISTS tenant_id text;

  CREATE INDEX IF NOT EXISTS idx_employees_tenant_id ON public.employees (tenant_id);

  -- 빈 tenant_id 는 매장 마스터 기준으로만 채움 (매장 매칭 안 되면 그대로 둠)
  IF to_regclass('public.erp_stores') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'erp_stores' AND column_name = 'tenant_id'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'erp_stores' AND column_name = 'store_name'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'erp_stores' AND column_name = 'store_code'
     ) THEN
    UPDATE public.employees e
    SET tenant_id = s.tenant_id
    FROM public.erp_stores s
    WHERE coalesce(trim(e.tenant_id), '') = ''
      AND nullif(trim(s.tenant_id), '') IS NOT NULL
      AND (
        lower(trim(e.store)) = lower(trim(coalesce(s.store_name, '')))
        OR lower(trim(e.store)) = lower(trim(coalesce(s.store_code, '')))
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
