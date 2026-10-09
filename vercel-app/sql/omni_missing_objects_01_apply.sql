-- ============================================================
-- Omni Supabase — 누락 테이블·컬럼·RPC 일괄 생성 (42703 / PGRST205 / PGRST202)
-- 프로젝트: zivwuwwffeqjshcprxlz (Omni)
-- ⚠️ 충만(레거시) DB에는 실행하지 마세요. (충만은 anon 허용 정책을 쓰는 곳이 있어 RLS 정책이 다름)
-- DDL만 있음 (기존 행 UPDATE 없음 → POS Realtime·자동인쇄 영향 없음). 재실행 안전.
--
-- Vercel(Omni) 로그 기준 누락:
--   · leave_requests.reject_reason            (getMyLeaveInfo 42703)
--   · notices.target_permission_group         (getMyNotices 42703)
--   · push_tokens                             (checkPushToken PGRST205)
--   · marketing_material_store_checks         (marketingMaterialStoreChecks PGRST205)
--   · pos_menu_boards                         (getPosMenuBoards PGRST205)
--   · interior_projects + get_interior_dashboard_summary (PGRST205 / PGRST202)
--   · store_repair_tickets                    (getStoreOpsAlertSummary PGRST205)
--
-- 출처: supabase_migration_consolidated_v2_clean / notice_enhancements / supabase_push_tokens(+_lang)
--       / marketing_material_store_checks / pos_menu_boards / store_repair_schema_all
--       / supabase_interior / interior_management_upgrade / notices_worklog_interior_tenant_id
-- 새 테이블은 Omni 규칙대로 anon·authenticated 차단 (서버 API는 service_role로 RLS 우회)
-- ============================================================

BEGIN;

-- 1) leave_requests / notices 누락 컬럼
DO $$
BEGIN
  IF to_regclass('public.leave_requests') IS NOT NULL THEN
    ALTER TABLE public.leave_requests
      ADD COLUMN IF NOT EXISTS reject_reason TEXT DEFAULT '',
      ADD COLUMN IF NOT EXISTS certificate_url TEXT DEFAULT '';
  ELSE
    RAISE NOTICE 'skip §1a: public.leave_requests not found';
  END IF;

  IF to_regclass('public.notices') IS NOT NULL THEN
    ALTER TABLE public.notices
      ADD COLUMN IF NOT EXISTS target_permission_group TEXT,
      ADD COLUMN IF NOT EXISTS target_recipients TEXT DEFAULT NULL,
      ADD COLUMN IF NOT EXISTS attachments TEXT,
      ADD COLUMN IF NOT EXISTS is_urgent BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS scheduled_at TIMESTAMPTZ;
  ELSE
    RAISE NOTICE 'skip §1b: public.notices not found';
  END IF;
END $$;

-- 2) push_tokens (FCM)
CREATE TABLE IF NOT EXISTS public.push_tokens (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  lang TEXT DEFAULT 'ko',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (store, name)
);
ALTER TABLE public.push_tokens ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ko';
CREATE INDEX IF NOT EXISTS idx_push_tokens_store_name ON public.push_tokens (store, name);
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON public.push_tokens (token);

-- 3) pos_menu_boards (POS 메뉴판 구성)
CREATE TABLE IF NOT EXISTS public.pos_menu_boards (
  id bigserial PRIMARY KEY,
  store_code text NOT NULL,
  board_type text NOT NULL,
  board_name text NOT NULL,
  group_grid_cols integer NOT NULL DEFAULT 5,
  group_grid_rows integer NOT NULL DEFAULT 2,
  menu_grid_cols integer NOT NULL DEFAULT 5,
  menu_grid_rows integer NOT NULL DEFAULT 5,
  resolution_width integer NOT NULL DEFAULT 1024,
  resolution_height integer NOT NULL DEFAULT 768,
  group_count integer NOT NULL DEFAULT 0,
  menu_count integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS pos_menu_boards_unique_name
  ON public.pos_menu_boards (store_code, board_type, board_name);

-- 4) marketing_material_store_checks (FK는 marketing_materials 있을 때만)
CREATE TABLE IF NOT EXISTS public.marketing_material_store_checks (
  id BIGSERIAL PRIMARY KEY,
  material_id BIGINT NOT NULL,
  campaign_id BIGINT NULL,
  store_name TEXT NOT NULL DEFAULT '',
  received_on DATE NULL,
  received_by TEXT NOT NULL DEFAULT '',
  installed_on DATE NULL,
  installed_by TEXT NOT NULL DEFAULT '',
  installed_placement_spot TEXT NULL,
  installed_photo_url TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT marketing_material_store_checks_unique
    UNIQUE (material_id, store_name),
  CONSTRAINT marketing_material_store_checks_placement_ck
    CHECK (
      installed_placement_spot IS NULL
      OR installed_placement_spot IN ('counter', 'tv', 'table', 'entrance')
    )
);
CREATE INDEX IF NOT EXISTS idx_marketing_material_store_checks_material
  ON public.marketing_material_store_checks (material_id);
CREATE INDEX IF NOT EXISTS idx_marketing_material_store_checks_campaign
  ON public.marketing_material_store_checks (campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_material_store_checks_store
  ON public.marketing_material_store_checks (store_name);

DO $$
BEGIN
  IF to_regclass('public.marketing_materials') IS NOT NULL
     AND NOT EXISTS (
       SELECT 1 FROM pg_constraint
       WHERE conname = 'marketing_material_store_checks_material_id_fkey'
     ) THEN
    ALTER TABLE public.marketing_material_store_checks
      ADD CONSTRAINT marketing_material_store_checks_material_id_fkey
      FOREIGN KEY (material_id) REFERENCES public.marketing_materials (id) ON DELETE CASCADE;
  END IF;
END $$;

-- 5) store_repair_tickets + 진행 로그
CREATE TABLE IF NOT EXISTS public.store_repair_tickets (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ticket_number text NOT NULL,
  store_name text NOT NULL,
  reporter text,
  category text,
  priority text,
  area text,
  title text,
  description text,
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  status text NOT NULL DEFAULT '접수',
  handler text,
  reported_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  completed_at timestamptz,
  resolution_note text,
  vendor_name text,
  estimated_cost numeric,
  actual_cost numeric
);
CREATE INDEX IF NOT EXISTS idx_store_repair_tickets_store ON public.store_repair_tickets (store_name);
CREATE INDEX IF NOT EXISTS idx_store_repair_tickets_status ON public.store_repair_tickets (status);
CREATE INDEX IF NOT EXISTS idx_store_repair_tickets_reported ON public.store_repair_tickets (reported_at DESC);

CREATE TABLE IF NOT EXISTS public.store_repair_progress_logs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  ticket_id bigint NOT NULL REFERENCES public.store_repair_tickets (id) ON DELETE CASCADE,
  author text,
  note text NOT NULL DEFAULT '',
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_store_repair_progress_ticket
  ON public.store_repair_progress_logs (ticket_id, created_at DESC);

-- 6) 인테리어 테이블 (기본 + 고도화)
CREATE TABLE IF NOT EXISTS public.interior_projects (
  id BIGSERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  location TEXT DEFAULT '',
  status TEXT DEFAULT 'active',
  budget_total NUMERIC(12,2) DEFAULT 0,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_projects_code ON public.interior_projects (code);
CREATE INDEX IF NOT EXISTS idx_interior_projects_status ON public.interior_projects (status);

CREATE TABLE IF NOT EXISTS public.interior_expense_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.interior_projects (id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  description TEXT NOT NULL,
  vendor_code TEXT DEFAULT '',
  quote NUMERIC(12,2) DEFAULT 0,
  paid NUMERIC(12,2) DEFAULT 0,
  balance NUMERIC(12,2) DEFAULT 0,
  payment_schedule JSONB DEFAULT '[]',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_expense_items_project ON public.interior_expense_items (project_id);

CREATE TABLE IF NOT EXISTS public.interior_direct_purchases (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.interior_projects (id) ON DELETE CASCADE,
  category TEXT NOT NULL,
  item_no INT DEFAULT 0,
  description TEXT NOT NULL,
  qty NUMERIC(10,2) DEFAULT 1,
  unit TEXT DEFAULT 'set',
  price NUMERIC(12,2) DEFAULT 0,
  sum_amount NUMERIC(12,2) DEFAULT 0,
  supplier_code TEXT DEFAULT '',
  status TEXT DEFAULT 'pending',
  remark TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_direct_purchases_project ON public.interior_direct_purchases (project_id);

CREATE TABLE IF NOT EXISTS public.interior_kitchen_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.interior_projects (id) ON DELETE CASCADE,
  item_name_kr TEXT DEFAULT '',
  item_name_en TEXT DEFAULT '',
  size_mm TEXT DEFAULT '',
  supplier_code TEXT DEFAULT '',
  zone TEXT DEFAULT '',
  price NUMERIC(12,2) DEFAULT 0,
  quantity NUMERIC(10,2) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_kitchen_items_project ON public.interior_kitchen_items (project_id);

CREATE TABLE IF NOT EXISTS public.interior_specifications (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.interior_projects (id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  code TEXT DEFAULT '',
  size TEXT DEFAULT '',
  supplier_code TEXT DEFAULT '',
  location TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_specifications_project ON public.interior_specifications (project_id);

CREATE TABLE IF NOT EXISTS public.interior_schedule_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.interior_projects (id) ON DELETE CASCADE,
  item_no INT DEFAULT 0,
  work_detail TEXT NOT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  day_progress JSONB DEFAULT '{}',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_schedule_items_project ON public.interior_schedule_items (project_id);

CREATE TABLE IF NOT EXISTS public.interior_project_files (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES public.interior_projects (id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INT DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_project_files_project ON public.interior_project_files (project_id);

CREATE TABLE IF NOT EXISTS public.interior_work_packages (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL,
  part_type text NOT NULL DEFAULT '',
  title text NOT NULL DEFAULT '',
  description text,
  start_date date,
  end_date date,
  status text NOT NULL DEFAULT 'planned',
  progress_pct numeric(5,2) NOT NULL DEFAULT 0,
  color text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_interior_work_packages_status
    CHECK (status IN ('planned', 'in_progress', 'blocked', 'done', 'cancelled')),
  CONSTRAINT chk_interior_work_packages_progress_pct
    CHECK (progress_pct >= 0 AND progress_pct <= 100)
);
CREATE INDEX IF NOT EXISTS idx_interior_work_packages_project
  ON public.interior_work_packages (project_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_interior_work_packages_dates
  ON public.interior_work_packages (project_id, start_date, end_date);

CREATE TABLE IF NOT EXISTS public.interior_vendor_tracks (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL,
  vendor_name text NOT NULL DEFAULT '',
  vendor_code text,
  work_package_id bigint REFERENCES public.interior_work_packages (id) ON DELETE SET NULL,
  payment_due_date date,
  payment_paid_date date,
  material_eta_date date,
  material_received_date date,
  work_completed_date date,
  status text NOT NULL DEFAULT 'planned',
  amount numeric(14,2) NOT NULL DEFAULT 0,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_interior_vendor_tracks_status
    CHECK (status IN ('planned', 'ordered', 'paid', 'received', 'done', 'delayed', 'cancelled'))
);
CREATE INDEX IF NOT EXISTS idx_interior_vendor_tracks_project
  ON public.interior_vendor_tracks (project_id, sort_order, id);
CREATE INDEX IF NOT EXISTS idx_interior_vendor_tracks_work_package
  ON public.interior_vendor_tracks (work_package_id);

CREATE TABLE IF NOT EXISTS public.interior_material_specs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL,
  material_code text,
  material_name text NOT NULL DEFAULT '',
  spec text,
  supplier text,
  unit text,
  unit_cost numeric(14,2) NOT NULL DEFAULT 0,
  image_url text,
  location text,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_interior_material_specs_project
  ON public.interior_material_specs (project_id, sort_order, id);

CREATE TABLE IF NOT EXISTS public.interior_layout_items (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL,
  zone text NOT NULL DEFAULT 'hall',
  floor text,
  x numeric(10,2) NOT NULL DEFAULT 0,
  y numeric(10,2) NOT NULL DEFAULT 0,
  w numeric(10,2) NOT NULL DEFAULT 1,
  h numeric(10,2) NOT NULL DEFAULT 1,
  rotation numeric(6,2) NOT NULL DEFAULT 0,
  item_name text NOT NULL DEFAULT '',
  qty numeric(10,2) NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'planned',
  material_spec_id bigint REFERENCES public.interior_material_specs (id) ON DELETE SET NULL,
  note text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_interior_layout_items_zone CHECK (zone IN ('kitchen', 'hall')),
  CONSTRAINT chk_interior_layout_items_status
    CHECK (status IN ('planned', 'ordered', 'installed', 'done', 'blocked'))
);
CREATE INDEX IF NOT EXISTS idx_interior_layout_items_project
  ON public.interior_layout_items (project_id, zone, sort_order, id);

CREATE TABLE IF NOT EXISTS public.interior_layout_editor_prefs (
  id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  project_id bigint NOT NULL,
  zone text NOT NULL DEFAULT 'kitchen',
  user_key text NOT NULL,
  user_store text,
  user_name text,
  employee_id bigint,
  duplicate_offset_x numeric(10,2) NOT NULL DEFAULT 0.5,
  duplicate_offset_y numeric(10,2) NOT NULL DEFAULT 0.5,
  snap_enabled boolean NOT NULL DEFAULT true,
  snap_step numeric(10,2) NOT NULL DEFAULT 0.5,
  nudge_small numeric(10,2) NOT NULL DEFAULT 0.1,
  nudge_medium numeric(10,2) NOT NULL DEFAULT 0.5,
  nudge_large numeric(10,2) NOT NULL DEFAULT 1.0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chk_interior_layout_editor_prefs_zone CHECK (zone IN ('kitchen', 'hall'))
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_interior_layout_editor_prefs_scope
  ON public.interior_layout_editor_prefs (project_id, zone, user_key);
CREATE INDEX IF NOT EXISTS idx_interior_layout_editor_prefs_lookup
  ON public.interior_layout_editor_prefs (project_id, zone, user_store, user_name);

-- 인테리어 tenant_id (Omni 회사 스코프)
DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'interior_projects',
    'interior_schedule_items',
    'interior_expense_items',
    'interior_kitchen_items',
    'interior_direct_purchases',
    'interior_specifications',
    'interior_project_files',
    'interior_work_packages',
    'interior_vendor_tracks',
    'interior_layout_items',
    'interior_material_specs',
    'interior_layout_editor_prefs'
  ]
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS tenant_id text NOT NULL DEFAULT ''''', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS idx_%s_tenant_id ON public.%I (tenant_id)', t, t);
  END LOOP;
END $$;

-- 7) 인테리어 대시보드 RPC (방콕 일자 기준, p_tenant_id 스코프)
DROP FUNCTION IF EXISTS public.get_interior_dashboard_summary();
DROP FUNCTION IF EXISTS public.get_interior_dashboard_summary(text);

CREATE OR REPLACE FUNCTION public.get_interior_dashboard_summary(p_tenant_id text DEFAULT NULL)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
with today as (
  select (now() at time zone 'Asia/Bangkok')::date as d
),
projects as (
  select
    id,
    code,
    name,
    coalesce(status, 'active') as status,
    coalesce(budget_total, 0)::numeric as budget_total
  from public.interior_projects
  where p_tenant_id is null
     or coalesce(trim(tenant_id), '') = ''
     or tenant_id = p_tenant_id
),
wp_projects as (
  select distinct project_id from public.interior_work_packages
),
wp_late as (
  select wp.project_id, count(*)::int as cnt
  from public.interior_work_packages wp
  cross join today t
  where coalesce(wp.status, 'planned') not in ('done', 'cancelled')
    and wp.end_date is not null
    and wp.end_date < t.d
    and exists (select 1 from projects p where p.id = wp.project_id)
  group by wp.project_id
),
legacy_late as (
  select si.project_id, count(*)::int as cnt
  from public.interior_schedule_items si
  cross join today t
  where not exists (
    select 1 from wp_projects wp where wp.project_id = si.project_id
  )
    and si.end_date is not null
    and si.end_date < t.d
    and exists (select 1 from projects p where p.id = si.project_id)
  group by si.project_id
),
schedule_late as (
  select project_id, sum(cnt)::int as cnt
  from (
    select project_id, cnt from wp_late
    union all
    select project_id, cnt from legacy_late
  ) x
  group by project_id
),
vt_late as (
  select v.project_id, count(*)::int as cnt
  from public.interior_vendor_tracks v
  cross join today t
  where coalesce(v.status, 'planned') not in ('done', 'cancelled')
    and (
      (v.payment_due_date is not null and v.payment_paid_date is null and v.payment_due_date < t.d)
      or (v.material_eta_date is not null and v.material_received_date is null and v.material_eta_date < t.d)
      or (
        v.work_completed_date is not null
        and coalesce(v.status, 'planned') <> 'done'
        and v.work_completed_date < t.d
      )
    )
    and exists (select 1 from projects p where p.id = v.project_id)
  group by v.project_id
),
paid as (
  select project_id, coalesce(sum(paid), 0)::numeric as paid_total
  from public.interior_expense_items e
  where exists (select 1 from projects p where p.id = e.project_id)
  group by project_id
),
project_rows as (
  select
    p.id,
    coalesce(paid.paid_total, 0) as paid_total,
    coalesce(schedule_late.cnt, 0) as schedule_late_count,
    coalesce(vt_late.cnt, 0) as vendor_delayed_count,
    (
      p.budget_total > 0
      and coalesce(paid.paid_total, 0) > p.budget_total
    ) as over_budget,
    (
      coalesce(schedule_late.cnt, 0) > 0
      or coalesce(vt_late.cnt, 0) > 0
      or (
        p.budget_total > 0
        and coalesce(paid.paid_total, 0) > p.budget_total
      )
    ) as has_alert
  from projects p
  left join paid on paid.project_id = p.id
  left join schedule_late on schedule_late.project_id = p.id
  left join vt_late on vt_late.project_id = p.id
)
select jsonb_build_object(
  'generatedAt', (select d::text from today),
  'totals', jsonb_build_object(
    'activeProjectCount', (
      select count(*)::int from projects where status <> 'completed'
    ),
    'scheduleOverdueCount', coalesce((select sum(schedule_late_count) from project_rows), 0),
    'vendorDelayedCount', coalesce((select sum(vendor_delayed_count) from project_rows), 0),
    'overBudgetProjectCount', (
      select count(*)::int from project_rows where over_budget
    ),
    'projectsWithAnyAlert', (
      select count(*)::int from project_rows where has_alert
    )
  ),
  'projects', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'id', id,
          'paidTotal', paid_total,
          'scheduleLateCount', schedule_late_count,
          'vendorDelayedCount', vendor_delayed_count,
          'overBudget', over_budget,
          'hasAlert', has_alert
        )
        order by id
      )
      from project_rows
    ),
    '[]'::jsonb
  )
);
$$;

-- 8) 새 테이블 RLS — Omni 규칙: anon·authenticated 차단 (service_role API만 접근)
DO $$
DECLARE
  t text;
  pol record;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'push_tokens',
    'pos_menu_boards',
    'marketing_material_store_checks',
    'store_repair_tickets',
    'store_repair_progress_logs',
    'interior_projects',
    'interior_expense_items',
    'interior_direct_purchases',
    'interior_kitchen_items',
    'interior_specifications',
    'interior_schedule_items',
    'interior_project_files',
    'interior_work_packages',
    'interior_vendor_tracks',
    'interior_material_specs',
    'interior_layout_items',
    'interior_layout_editor_prefs'
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
