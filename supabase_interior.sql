-- ============================================================
-- 인테리어 ERP 테이블
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

-- 1. 인테리어 프로젝트 (점포·사업장별)
CREATE TABLE IF NOT EXISTS interior_projects (
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
CREATE INDEX IF NOT EXISTS idx_interior_projects_code ON interior_projects(code);
CREATE INDEX IF NOT EXISTS idx_interior_projects_status ON interior_projects(status);

-- 2. 프로젝트별 비용 항목 (Expense 시트)
CREATE TABLE IF NOT EXISTS interior_expense_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_interior_expense_items_project ON interior_expense_items(project_id);

-- 3. 직매입 품목 (Direct purchase)
CREATE TABLE IF NOT EXISTS interior_direct_purchases (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
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
CREATE INDEX IF NOT EXISTS idx_interior_direct_purchases_project ON interior_direct_purchases(project_id);

-- 4. 주방 설비
CREATE TABLE IF NOT EXISTS interior_kitchen_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  item_name_kr TEXT DEFAULT '',
  item_name_en TEXT DEFAULT '',
  size_mm TEXT DEFAULT '',
  supplier_code TEXT DEFAULT '',
  zone TEXT DEFAULT '',
  price NUMERIC(12,2) DEFAULT 0,
  quantity NUMERIC(10,2) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_kitchen_items_project ON interior_kitchen_items(project_id);

-- 5. 사양서
CREATE TABLE IF NOT EXISTS interior_specifications (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  code TEXT DEFAULT '',
  size TEXT DEFAULT '',
  supplier_code TEXT DEFAULT '',
  location TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_specifications_project ON interior_specifications(project_id);

-- 6. 프로젝트 일정 (Master Schedule)
CREATE TABLE IF NOT EXISTS interior_schedule_items (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  item_no INT DEFAULT 0,
  work_detail TEXT NOT NULL,
  start_date DATE DEFAULT NULL,
  end_date DATE DEFAULT NULL,
  day_progress JSONB DEFAULT '{}',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_schedule_items_project ON interior_schedule_items(project_id);

-- 7. 도면·견적서 파일
CREATE TABLE IF NOT EXISTS interior_project_files (
  id BIGSERIAL PRIMARY KEY,
  project_id BIGINT NOT NULL REFERENCES interior_projects(id) ON DELETE CASCADE,
  file_type TEXT NOT NULL,
  file_name TEXT NOT NULL,
  file_path TEXT NOT NULL,
  file_size INT DEFAULT 0,
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_interior_project_files_project ON interior_project_files(project_id);

-- Storage: Supabase 대시보드 > Storage > New bucket > "interior-files" 생성 후 Public 체크
-- (또는 SQL로: insert into storage.buckets (id, name, public) values ('interior-files', 'interior-files', true);)

-- RLS
ALTER TABLE interior_projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for interior_projects" ON interior_projects;
CREATE POLICY "Allow all for interior_projects" ON interior_projects FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE interior_expense_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for interior_expense_items" ON interior_expense_items;
CREATE POLICY "Allow all for interior_expense_items" ON interior_expense_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE interior_direct_purchases ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for interior_direct_purchases" ON interior_direct_purchases;
CREATE POLICY "Allow all for interior_direct_purchases" ON interior_direct_purchases FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE interior_kitchen_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for interior_kitchen_items" ON interior_kitchen_items;
CREATE POLICY "Allow all for interior_kitchen_items" ON interior_kitchen_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE interior_specifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for interior_specifications" ON interior_specifications;
CREATE POLICY "Allow all for interior_specifications" ON interior_specifications FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE interior_schedule_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for interior_schedule_items" ON interior_schedule_items;
CREATE POLICY "Allow all for interior_schedule_items" ON interior_schedule_items FOR ALL USING (true) WITH CHECK (true);

ALTER TABLE interior_project_files ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for interior_project_files" ON interior_project_files;
CREATE POLICY "Allow all for interior_project_files" ON interior_project_files FOR ALL USING (true) WITH CHECK (true);
