-- Omni SaaS: 직급별 일정표(routine_templates / daily_plans) tenant_id
-- Supabase SQL Editor (Omni DB)에 붙여넣어 실행.
-- 충만(레거시)도 재실행 안전. 백필: store_name / employee_id → erp_stores·employees.
-- Realtime 구독 테이블(pos_orders 등)은 건드리지 않음 → 영업 중 실행 가능.

-- ── 1) 컬럼 + 인덱스 ─────────────────────────────────────────
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['routine_templates', 'daily_plans']
  LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id text', t);
    EXECUTE format(
      'UPDATE public.%I SET tenant_id = '''' WHERE tenant_id IS NULL',
      t
    );
    EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET DEFAULT ''''', t);
    BEGIN
      EXECUTE format('ALTER TABLE public.%I ALTER COLUMN tenant_id SET NOT NULL', t);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE '% tenant_id not null skip: %', t, SQLERRM;
    END;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_%s_tenant_id ON public.%I (tenant_id)',
      t,
      t
    );
  END LOOP;
END $$;

-- ── 2) routine_templates: store_name → erp_stores, employee_id → employees ──
DO $$
BEGIN
  IF to_regclass('public.routine_templates') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.erp_stores') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'erp_stores' AND column_name = 'tenant_id'
     ) THEN
    UPDATE public.routine_templates rt
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(trim(rt.tenant_id), '') = ''
      AND nullif(trim(es.tenant_id), '') IS NOT NULL
      AND nullif(trim(rt.store_name), '') IS NOT NULL
      AND (
        lower(trim(rt.store_name)) = lower(trim(coalesce(es.store_code, '')))
        OR lower(trim(rt.store_name)) = lower(trim(coalesce(es.store_name, '')))
        OR lower(trim(rt.store_name)) = lower(trim(coalesce(es.display_name, '')))
      );
  END IF;

  IF to_regclass('public.employees') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'tenant_id'
     )
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'routine_templates' AND column_name = 'employee_id'
     ) THEN
    UPDATE public.routine_templates rt
    SET tenant_id = e.tenant_id
    FROM public.employees e
    WHERE coalesce(trim(rt.tenant_id), '') = ''
      AND nullif(trim(e.tenant_id), '') IS NOT NULL
      AND rt.employee_id IS NOT NULL
      AND e.id = rt.employee_id;
  END IF;
END $$;

-- ── 3) daily_plans: employee_id → employees, store_name → erp_stores ──
DO $$
BEGIN
  IF to_regclass('public.daily_plans') IS NULL THEN
    RETURN;
  END IF;

  IF to_regclass('public.employees') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'employees' AND column_name = 'tenant_id'
     ) THEN
    UPDATE public.daily_plans dp
    SET tenant_id = e.tenant_id
    FROM public.employees e
    WHERE coalesce(trim(dp.tenant_id), '') = ''
      AND nullif(trim(e.tenant_id), '') IS NOT NULL
      AND dp.employee_id IS NOT NULL
      AND e.id = dp.employee_id;
  END IF;

  IF to_regclass('public.erp_stores') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'erp_stores' AND column_name = 'tenant_id'
     ) THEN
    UPDATE public.daily_plans dp
    SET tenant_id = es.tenant_id
    FROM public.erp_stores es
    WHERE coalesce(trim(dp.tenant_id), '') = ''
      AND nullif(trim(es.tenant_id), '') IS NOT NULL
      AND (
        lower(trim(coalesce(dp.store_name, ''))) = lower(trim(coalesce(es.store_code, '')))
        OR lower(trim(coalesce(dp.store_name, ''))) = lower(trim(coalesce(es.store_name, '')))
        OR lower(trim(coalesce(dp.employee_store, ''))) = lower(trim(coalesce(es.store_code, '')))
        OR lower(trim(coalesce(dp.employee_store, ''))) = lower(trim(coalesce(es.store_name, '')))
      );
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('daily_plans_10_tenant_id.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
