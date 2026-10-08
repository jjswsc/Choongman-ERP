-- 직급별 일일 업무표 — 루틴 템플릿 + 개인별 일일 업무표
-- 신규 테이블만 생성. 기존 테이블 UPDATE 없음.

CREATE TABLE IF NOT EXISTS routine_templates (
  id bigserial PRIMARY KEY,
  name text NOT NULL DEFAULT '',
  role_scope text NOT NULL DEFAULT 'supervisor',
  position text NOT NULL DEFAULT 'all',
  store_name text NOT NULL DEFAULT '',
  status text NOT NULL DEFAULT 'draft',
  version integer NOT NULL DEFAULT 1,
  note text NOT NULL DEFAULT '',
  updated_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_templates_scope ON routine_templates (role_scope, status);

CREATE TABLE IF NOT EXISTS routine_template_items (
  id bigserial PRIMARY KEY,
  template_id bigint NOT NULL REFERENCES routine_templates(id) ON DELETE CASCADE,
  sort_order integer NOT NULL DEFAULT 0,
  time_slot text NOT NULL DEFAULT '',
  block text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '기타',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  est_minutes integer NOT NULL DEFAULT 15,
  weekdays text NOT NULL DEFAULT '1234567',
  photo_required boolean NOT NULL DEFAULT false,
  link_type text NOT NULL DEFAULT 'none',
  per_store boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_routine_template_items_template ON routine_template_items (template_id, sort_order);

CREATE TABLE IF NOT EXISTS daily_plans (
  id bigserial PRIMARY KEY,
  plan_date date NOT NULL,
  employee_id bigint NOT NULL,
  employee_name text NOT NULL DEFAULT '',
  employee_store text NOT NULL DEFAULT '',
  role_scope text NOT NULL DEFAULT 'staff',
  position text NOT NULL DEFAULT 'all',
  store_name text NOT NULL DEFAULT '',
  route_stores jsonb NOT NULL DEFAULT '[]'::jsonb,
  shift_in text NOT NULL DEFAULT '',
  shift_out text NOT NULL DEFAULT '',
  template_id bigint,
  status text NOT NULL DEFAULT 'planned',
  briefing_note text NOT NULL DEFAULT '',
  published_at timestamptz,
  closed_at timestamptz,
  est_total integer NOT NULL DEFAULT 0,
  actual_total integer NOT NULL DEFAULT 0,
  work_log_id text NOT NULL DEFAULT '',
  created_by text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plan_date, employee_id)
);

CREATE INDEX IF NOT EXISTS idx_daily_plans_date ON daily_plans (plan_date, role_scope);
CREATE INDEX IF NOT EXISTS idx_daily_plans_store ON daily_plans (store_name, plan_date);
CREATE INDEX IF NOT EXISTS idx_daily_plans_name ON daily_plans (employee_name, plan_date);

CREATE TABLE IF NOT EXISTS daily_plan_items (
  id bigserial PRIMARY KEY,
  plan_id bigint NOT NULL REFERENCES daily_plans(id) ON DELETE CASCADE,
  source text NOT NULL DEFAULT 'routine',
  ref_id text NOT NULL DEFAULT '',
  store_name text NOT NULL DEFAULT '',
  time_slot text NOT NULL DEFAULT '',
  block text NOT NULL DEFAULT '',
  category text NOT NULL DEFAULT '기타',
  title text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  est_minutes integer NOT NULL DEFAULT 0,
  link_type text NOT NULL DEFAULT 'none',
  photo_required boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'todo',
  started_at timestamptz,
  finished_at timestamptz,
  actual_minutes integer,
  skip_reason text NOT NULL DEFAULT '',
  photo_urls jsonb NOT NULL DEFAULT '[]'::jsonb,
  note text NOT NULL DEFAULT '',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_plan_items_plan ON daily_plan_items (plan_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_daily_plan_items_ref ON daily_plan_items (source, ref_id);
CREATE INDEX IF NOT EXISTS idx_daily_plan_items_link ON daily_plan_items (link_type, store_name);
