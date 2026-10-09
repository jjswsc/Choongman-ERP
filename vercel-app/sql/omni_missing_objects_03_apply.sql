-- ============================================================
-- Omni Supabase — 누락 객체 2차 (42703 / PGRST205)
-- 프로젝트: zivwuwwffeqjshcprxlz (Omni)
-- ⚠️ 충만(레거시) DB에는 실행하지 마세요.
-- DDL만 있음 (기존 행 UPDATE 없음 → POS Realtime·자동인쇄 영향 없음). 재실행 안전.
--
-- Vercel(Omni) 로그 기준 누락:
--   · leave_requests.employee_id      (getMyLeaveInfo 42703)
--   · marketing_materials             (marketingMaterials PGRST205)
--     + 하위 marketing_material_deployments / marketing_material_gifts
--
-- leave_requests.employee_id 가 NULL 인 과거 행은 앱이 매장+이름으로 대조하므로 백필 불필요.
-- 출처: employees_employee_code_leave_employee_id / marketing_materials(+_produced_on)
--       / marketing_expense_accrual_link / marketing_material_deployments / marketing_material_gifts
--       / marketing_tenant_id
-- ============================================================

BEGIN;

-- 1) leave_requests.employee_id
DO $$
BEGIN
  IF to_regclass('public.leave_requests') IS NULL THEN
    RAISE NOTICE 'skip §1: public.leave_requests not found';
    RETURN;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'employee_id'
  ) THEN
    IF to_regclass('public.employees') IS NOT NULL THEN
      ALTER TABLE public.leave_requests
        ADD COLUMN employee_id bigint REFERENCES public.employees (id) ON DELETE SET NULL;
    ELSE
      ALTER TABLE public.leave_requests ADD COLUMN employee_id bigint;
    END IF;
  END IF;

  CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON public.leave_requests (employee_id);
END $$;

-- 2) marketing_materials (캠페인별 판촉물)
CREATE TABLE IF NOT EXISTS public.marketing_materials (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT NOT NULL,
  type TEXT NOT NULL DEFAULT 'tentcard',
  name TEXT NOT NULL DEFAULT '',
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_cost NUMERIC(12,2) NOT NULL DEFAULT 0,
  branches JSONB NOT NULL DEFAULT '[]',
  is_hq_wide BOOLEAN NOT NULL DEFAULT FALSE,
  display_start_date DATE NULL,
  display_end_date DATE NULL,
  placement_spots JSONB NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'planning',
  produced_on DATE NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.marketing_materials
  ADD COLUMN IF NOT EXISTS actual_cost NUMERIC(14,2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS expense_accrual_id BIGINT NULL,
  ADD COLUMN IF NOT EXISTS vendor_code TEXT,
  ADD COLUMN IF NOT EXISTS tenant_id TEXT;

CREATE INDEX IF NOT EXISTS idx_marketing_materials_campaign_id
  ON public.marketing_materials (campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_materials_is_hq_wide
  ON public.marketing_materials (is_hq_wide);
CREATE INDEX IF NOT EXISTS idx_marketing_materials_produced_on
  ON public.marketing_materials (produced_on)
  WHERE produced_on IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_marketing_materials_expense_accrual_id
  ON public.marketing_materials (expense_accrual_id);
CREATE INDEX IF NOT EXISTS idx_marketing_materials_tenant_id
  ON public.marketing_materials (tenant_id);

-- 3) marketing_material_deployments (매장별 배치/철수 이력)
CREATE TABLE IF NOT EXISTS public.marketing_material_deployments (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES public.marketing_materials (id) ON DELETE CASCADE,
  campaign_id BIGINT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  placement_spot TEXT NOT NULL DEFAULT 'counter',
  material_type TEXT NULL,
  installed_on DATE NOT NULL,
  removed_on DATE NULL,
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_material_deployments_date_ck
    CHECK (removed_on IS NULL OR removed_on >= installed_on)
);
ALTER TABLE public.marketing_material_deployments ADD COLUMN IF NOT EXISTS tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_material_id
  ON public.marketing_material_deployments (material_id);
CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_campaign_id
  ON public.marketing_material_deployments (campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_store_spot
  ON public.marketing_material_deployments (store_name, placement_spot);
CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_active
  ON public.marketing_material_deployments (installed_on, removed_on);
CREATE INDEX IF NOT EXISTS idx_marketing_material_deployments_tenant_id
  ON public.marketing_material_deployments (tenant_id);

-- 4) marketing_material_gifts (사은품 배정/배포/잔여)
CREATE TABLE IF NOT EXISTS public.marketing_material_gifts (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL REFERENCES public.marketing_materials (id) ON DELETE CASCADE,
  campaign_id BIGINT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  gift_name TEXT NOT NULL DEFAULT '',
  allocated_qty INTEGER NOT NULL DEFAULT 0,
  distributed_qty INTEGER NOT NULL DEFAULT 0,
  remaining_qty INTEGER NOT NULL DEFAULT 0,
  rule_note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.marketing_material_gifts ADD COLUMN IF NOT EXISTS tenant_id TEXT;
CREATE INDEX IF NOT EXISTS idx_marketing_material_gifts_material_id
  ON public.marketing_material_gifts (material_id);
CREATE INDEX IF NOT EXISTS idx_marketing_material_gifts_campaign_id
  ON public.marketing_material_gifts (campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_material_gifts_store_name
  ON public.marketing_material_gifts (store_name);
CREATE INDEX IF NOT EXISTS idx_marketing_material_gifts_tenant_id
  ON public.marketing_material_gifts (tenant_id);

-- 5) marketing_material_store_checks — 1차 패치에서 만든 테이블에 FK·tenant_id 보강
DO $$
BEGIN
  IF to_regclass('public.marketing_material_store_checks') IS NULL THEN
    RAISE NOTICE 'skip §5: public.marketing_material_store_checks not found';
    RETURN;
  END IF;

  ALTER TABLE public.marketing_material_store_checks ADD COLUMN IF NOT EXISTS tenant_id TEXT;
  CREATE INDEX IF NOT EXISTS idx_marketing_material_store_checks_tenant_id
    ON public.marketing_material_store_checks (tenant_id);

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_material_store_checks_material_id_fkey'
  ) THEN
    ALTER TABLE public.marketing_material_store_checks
      ADD CONSTRAINT marketing_material_store_checks_material_id_fkey
      FOREIGN KEY (material_id) REFERENCES public.marketing_materials (id) ON DELETE CASCADE;
  END IF;
END $$;

-- 6) 새 테이블 RLS — Omni 규칙: anon·authenticated 차단 (service_role API만 접근)
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'marketing_materials',
    'marketing_material_deployments',
    'marketing_material_gifts'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    FOR pol IN
      SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = t
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', pol.policyname, t);
    END LOOP;
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO anon USING (false) WITH CHECK (false)',
      'omni_deny_anon_all_' || t, t
    );
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (false) WITH CHECK (false)',
      'omni_deny_authenticated_all_' || t, t
    );
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';

COMMIT;
