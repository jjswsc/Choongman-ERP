-- ============================================================
-- Choongman ERP - Supabase 전체 스키마
-- 사용법: 아래 전체를 복사 → Supabase 대시보드 > SQL Editor 붙여넣기 → Run
-- (기존 테이블이 있어도 ALTER/CREATE IF NOT EXISTS 로 안전하게 반영됨)
-- ============================================================

-- 품목 (기존 시트 "품목" / "Items")
CREATE TABLE IF NOT EXISTS items (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  category TEXT DEFAULT '',
  name TEXT NOT NULL,
  spec TEXT DEFAULT '',
  price NUMERIC(12,2) DEFAULT 0,
  cost NUMERIC(12,2) DEFAULT 0,
  image TEXT DEFAULT '',
  vendor TEXT DEFAULT '',
  tax TEXT DEFAULT '과세',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_items_code ON items(code);

-- 거래처 (기존 시트 "거래처") - K열=매장명(GPS대조용), L/M=위도/경도
CREATE TABLE IF NOT EXISTS vendors (
  id BIGSERIAL PRIMARY KEY,
  type TEXT DEFAULT '',
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  tax_id TEXT DEFAULT '',
  ceo TEXT DEFAULT '',
  addr TEXT DEFAULT '',
  manager TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  balance NUMERIC(12,2) DEFAULT 0,
  memo TEXT DEFAULT '',
  gps_name TEXT DEFAULT '',
  lat TEXT DEFAULT '',
  lng TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 기존 DB에 컬럼 추가 (인덱스보다 먼저 실행해야 함)
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS gps_name TEXT DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS lat TEXT DEFAULT '';
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS lng TEXT DEFAULT '';
CREATE INDEX IF NOT EXISTS idx_vendors_code ON vendors(code);
CREATE INDEX IF NOT EXISTS idx_vendors_gps_name ON vendors(gps_name);

-- 주문 (기존 시트 "주문")
CREATE TABLE IF NOT EXISTS orders (
  id BIGSERIAL PRIMARY KEY,
  order_date TIMESTAMPTZ DEFAULT NOW(),
  store_name TEXT NOT NULL,
  user_name TEXT NOT NULL,
  cart_json TEXT NOT NULL,
  subtotal NUMERIC(12,2) DEFAULT 0,
  vat NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'Pending',
  delivery_status TEXT DEFAULT '',
  image_url TEXT DEFAULT '',
  delivery_date TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_order_date ON orders(order_date);

-- 창고/배송 위치 (본사 발주 시 선택)
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  location_code TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_sort ON warehouse_locations(sort_order);
-- 기본 창고 (선택 실행): INSERT INTO warehouse_locations (name, address, location_code, sort_order)
--   VALUES ('창고', 'JIDUBANG(ASIA) 262 3 Bangkok-Chon Buri New Line Rd, Prawet, Bangkok 10250', '창고', 1);

-- 발주서 (본사 → 거래처 발주)
CREATE TABLE IF NOT EXISTS purchase_orders (
  id BIGSERIAL PRIMARY KEY,
  po_no TEXT,
  vendor_code TEXT NOT NULL,
  vendor_name TEXT NOT NULL,
  location_name TEXT NOT NULL,
  location_address TEXT NOT NULL,
  location_code TEXT NOT NULL,
  cart_json TEXT NOT NULL,
  subtotal NUMERIC(12,2) DEFAULT 0,
  vat NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  user_name TEXT DEFAULT '',
  status TEXT DEFAULT 'Draft',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor ON purchase_orders(vendor_code);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_created ON purchase_orders(created_at);

-- 재고 이력 (기존 시트 "재고") - 한 행이 한 건 입출고
CREATE TABLE IF NOT EXISTS stock_logs (
  id BIGSERIAL PRIMARY KEY,
  location TEXT NOT NULL,
  item_code TEXT NOT NULL,
  item_name TEXT DEFAULT '',
  spec TEXT DEFAULT '',
  qty NUMERIC(12,2) NOT NULL,
  log_date TIMESTAMPTZ NOT NULL,
  vendor_target TEXT DEFAULT '',
  log_type TEXT NOT NULL,
  order_id BIGINT DEFAULT NULL,
  delivery_status TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_stock_logs_location ON stock_logs(location);
CREATE INDEX IF NOT EXISTS idx_stock_logs_item_code ON stock_logs(item_code);
CREATE INDEX IF NOT EXISTS idx_stock_logs_log_date ON stock_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_stock_logs_log_type ON stock_logs(log_type);

-- 매장설정 (기존 시트 "매장설정") - 매장별 품목 적정재고
CREATE TABLE IF NOT EXISTS store_settings (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  code TEXT NOT NULL,
  safe_qty NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store, code)
);
CREATE INDEX IF NOT EXISTS idx_store_settings_store ON store_settings(store);

-- 직원정보 (기존 시트 "직원정보" / "Users") - 2단계
-- 구글 시트 순서: 이메일 → 연차수 → 은행명 → 계좌번호 → 직책수당 → 등급 → (직원 사진은 photo)
CREATE TABLE IF NOT EXISTS employees (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  nick TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  job TEXT DEFAULT '',
  birth DATE DEFAULT NULL,
  nation TEXT DEFAULT '',
  join_date DATE DEFAULT NULL,
  resign_date DATE DEFAULT NULL,
  sal_type TEXT DEFAULT 'Monthly',
  sal_amt NUMERIC(12,2) DEFAULT 0,
  password TEXT DEFAULT '',
  role TEXT DEFAULT 'Staff',
  email TEXT DEFAULT '',
  annual_leave_days NUMERIC(5,2) DEFAULT 15,
  bank_name TEXT DEFAULT '',
  account_number TEXT DEFAULT '',
  position_allowance NUMERIC(12,2) DEFAULT 0,
  haz_allow NUMERIC(12,2) DEFAULT 0,
  grade TEXT DEFAULT '',
  photo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store, name)
);
CREATE INDEX IF NOT EXISTS idx_employees_store ON employees(store);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);

-- 기존 employees 테이블에 컬럼이 없다면 추가 (마이그레이션)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC(5,2) DEFAULT 15;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS haz_allow NUMERIC(12,2) DEFAULT 0;
-- (선택) 기존에 photo 열에 연차 일수가 들어가 있던 경우, 숫자만 있는 행은 annual_leave_days로 복사
-- Supabase SQL Editor에서 1회 실행 후 주석 해제 유지 또는 삭제 가능:
-- UPDATE employees SET annual_leave_days = NULLIF(REGEXP_REPLACE(TRIM(photo), '[^0-9.]', '', 'g'), '')::NUMERIC WHERE photo IS NOT NULL AND photo <> '' AND TRIM(photo) ~ '^[0-9]+\.?[0-9]*$';
-- UPDATE employees SET photo = '' WHERE photo IS NOT NULL AND TRIM(photo) ~ '^[0-9]+\.?[0-9]*$';

-- 휴가신청 (3단계) - A:신청일시, B:매장, C:이름, D:구분, E:휴가날짜, F:사유, G:상태
CREATE TABLE IF NOT EXISTS leave_requests (
  id BIGSERIAL PRIMARY KEY,
  request_at TIMESTAMPTZ DEFAULT NOW(),
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT '',
  leave_date DATE NOT NULL,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT '대기',
  certificate_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_leave_requests_store ON leave_requests(store);
CREATE INDEX IF NOT EXISTS idx_leave_requests_leave_date ON leave_requests(leave_date);
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS certificate_url TEXT DEFAULT '';

-- 공지사항 (기존 시트 "공지사항") - ID=Date.now() 호환
CREATE TABLE IF NOT EXISTS notices (
  id BIGINT PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  target_store TEXT DEFAULT '전체',
  target_role TEXT DEFAULT '전체',
  target_recipients TEXT DEFAULT NULL,
  sender TEXT DEFAULT '',
  attachments TEXT DEFAULT ''
);
CREATE INDEX IF NOT EXISTS idx_notices_created_at ON notices(created_at);

-- 공지확인 (기존 시트 "공지확인") - 공지ID, 매장, 이름 기준 1건
CREATE TABLE IF NOT EXISTS notice_reads (
  id BIGSERIAL PRIMARY KEY,
  notice_id BIGINT NOT NULL,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  read_at TIMESTAMPTZ DEFAULT NOW(),
  status TEXT DEFAULT '확인',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(notice_id, store, name)
);
CREATE INDEX IF NOT EXISTS idx_notice_reads_notice_id ON notice_reads(notice_id);
CREATE INDEX IF NOT EXISTS idx_notice_reads_store_name ON notice_reads(store, name);

-- 업무일지 (기존 시트 "업무일지_DB") - ID, 날짜, 부서, 이름, 내용, 진행률, 상태, 우선순위, 승인상태, 코멘트
CREATE TABLE IF NOT EXISTS work_logs (
  id TEXT PRIMARY KEY,
  log_date DATE NOT NULL,
  dept TEXT DEFAULT '',
  name TEXT NOT NULL,
  content TEXT DEFAULT '',
  progress NUMERIC(5,2) DEFAULT 0,
  status TEXT DEFAULT 'Today',
  priority TEXT DEFAULT '',
  manager_check TEXT DEFAULT '대기',
  manager_comment TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_work_logs_log_date ON work_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_work_logs_name ON work_logs(name);

-- 매장방문 (기존 시트 "매장방문_DB") - ID, 날짜, 이름, 방문매장, 구분, 목적, 시간, 위도, 경도, 체류시간, 비고
CREATE TABLE IF NOT EXISTS store_visits (
  id TEXT PRIMARY KEY,
  visit_date DATE NOT NULL,
  name TEXT NOT NULL,
  store_name TEXT NOT NULL,
  visit_type TEXT DEFAULT '',
  purpose TEXT DEFAULT '',
  visit_time TEXT DEFAULT '',
  lat TEXT DEFAULT '',
  lng TEXT DEFAULT '',
  duration_min NUMERIC(12,2) DEFAULT 0,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_store_visits_visit_date ON store_visits(visit_date);
CREATE INDEX IF NOT EXISTS idx_store_visits_name ON store_visits(name);
CREATE INDEX IF NOT EXISTS idx_store_visits_store_name ON store_visits(store_name);

-- 공휴일 (3단계) - 연도, 날짜(yyyy-MM-dd), 휴일명
CREATE TABLE IF NOT EXISTS public_holidays (
  id BIGSERIAL PRIMARY KEY,
  year INT NOT NULL,
  date DATE NOT NULL,
  name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_public_holidays_year ON public_holidays(year);

-- 근태기록 (3단계) - 일시, 매장명, 이름, 유형, 위도, 경도, 계획시간, 지각(분), 조퇴(분), 연장(분), 실제휴게(분), 사유, 상태, 승인여부
CREATE TABLE IF NOT EXISTS attendance_logs (
  id BIGSERIAL PRIMARY KEY,
  log_at TIMESTAMPTZ NOT NULL,
  store_name TEXT NOT NULL,
  name TEXT NOT NULL,
  log_type TEXT NOT NULL,
  lat TEXT DEFAULT '',
  lng TEXT DEFAULT '',
  planned_time TEXT DEFAULT '',
  late_min NUMERIC(12,2) DEFAULT 0,
  early_min NUMERIC(12,2) DEFAULT 0,
  ot_min NUMERIC(12,2) DEFAULT 0,
  break_min NUMERIC(12,2) DEFAULT 0,
  reason TEXT DEFAULT '',
  status TEXT DEFAULT '',
  approved TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_store ON attendance_logs(store_name);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_log_at ON attendance_logs(log_at);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_log_type ON attendance_logs(log_type);

-- 직원시간표 (3단계) - 날짜, 매장명, 이름, 계획출근, 계획퇴근, 계획휴게시작, 계획휴게종료, 비고, 기록날짜
CREATE TABLE IF NOT EXISTS schedules (
  id BIGSERIAL PRIMARY KEY,
  schedule_date DATE NOT NULL,
  store_name TEXT NOT NULL,
  name TEXT NOT NULL,
  plan_in TEXT DEFAULT '',
  plan_out TEXT DEFAULT '',
  break_start TEXT DEFAULT '',
  break_end TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  recorded_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS plan_in_prev_day BOOLEAN DEFAULT FALSE;
CREATE INDEX IF NOT EXISTS idx_schedules_date ON schedules(schedule_date);
CREATE INDEX IF NOT EXISTS idx_schedules_store ON schedules(store_name);

-- 급여_DB (3단계) - 귀속월, 매장, 이름, 부서, 직급, 기본급, 수당들, OT, 공제, 실수령액, 상태
CREATE TABLE IF NOT EXISTS payroll_records (
  id BIGSERIAL PRIMARY KEY,
  month TEXT NOT NULL,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  dept TEXT DEFAULT '',
  role TEXT DEFAULT '',
  salary NUMERIC(12,2) DEFAULT 0,
  pos_allow NUMERIC(12,2) DEFAULT 0,
  haz_allow NUMERIC(12,2) DEFAULT 0,
  birth_bonus NUMERIC(12,2) DEFAULT 0,
  holiday_pay NUMERIC(12,2) DEFAULT 0,
  spl_bonus NUMERIC(12,2) DEFAULT 0,
  ot_15 NUMERIC(12,2) DEFAULT 0,
  ot_20 NUMERIC(12,2) DEFAULT 0,
  ot_30 NUMERIC(12,2) DEFAULT 0,
  ot_amt NUMERIC(12,2) DEFAULT 0,
  late_min NUMERIC(12,2) DEFAULT 0,
  late_ded NUMERIC(12,2) DEFAULT 0,
  sso NUMERIC(12,2) DEFAULT 0,
  tax NUMERIC(12,2) DEFAULT 0,
  other_ded NUMERIC(12,2) DEFAULT 0,
  net_pay NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT '확정',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(month, store, name)
);
CREATE INDEX IF NOT EXISTS idx_payroll_records_month ON payroll_records(month);

-- 점검항목 (기존 시트 "점검항목") - item_id=시트 A열 번호, 대분류, 중분류, 항목명, 사용
CREATE TABLE IF NOT EXISTS checklist_items (
  id BIGSERIAL PRIMARY KEY,
  item_id INT NOT NULL DEFAULT 1,
  main_cat TEXT DEFAULT '',
  sub_cat TEXT DEFAULT '',
  name TEXT DEFAULT '',
  use_flag BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS item_id INT NOT NULL DEFAULT 1;
CREATE INDEX IF NOT EXISTS idx_checklist_items_use ON checklist_items(use_flag);
CREATE INDEX IF NOT EXISTS idx_checklist_items_item_id ON checklist_items(item_id);

-- 점검결과 (기존 시트 "점검결과") - id, 날짜, 매장, 점검자, 결과, 메모, 상세JSON
CREATE TABLE IF NOT EXISTS check_results (
  id TEXT PRIMARY KEY,
  check_date DATE NOT NULL,
  store_name TEXT NOT NULL,
  inspector TEXT DEFAULT '',
  summary TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  json_data TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_check_results_date ON check_results(check_date);
CREATE INDEX IF NOT EXISTS idx_check_results_store ON check_results(store_name);

-- 컴플레인일지 (기존 시트 "컴플레인일지")
CREATE TABLE IF NOT EXISTS complaint_logs (
  id BIGSERIAL PRIMARY KEY,
  number TEXT DEFAULT '',
  log_date DATE,
  log_time TEXT DEFAULT '',
  store_name TEXT DEFAULT '',
  writer TEXT DEFAULT '',
  customer TEXT DEFAULT '',
  contact TEXT DEFAULT '',
  visit_path TEXT DEFAULT '',
  platform TEXT DEFAULT '',
  complaint_type TEXT DEFAULT '',
  menu TEXT DEFAULT '',
  title TEXT DEFAULT '',
  content TEXT DEFAULT '',
  severity TEXT DEFAULT '',
  action TEXT DEFAULT '',
  status TEXT DEFAULT '접수',
  handler TEXT DEFAULT '',
  done_date DATE,
  photo_url TEXT DEFAULT '',
  remark TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_complaint_logs_date ON complaint_logs(log_date);
CREATE INDEX IF NOT EXISTS idx_complaint_logs_store ON complaint_logs(store_name);

-- 메뉴권한 (기존 시트 "메뉴권한") - store, name 기준 1행, 권한은 JSON
CREATE TABLE IF NOT EXISTS menu_permissions (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  permissions TEXT DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store, name)
);
CREATE INDEX IF NOT EXISTS idx_menu_permissions_store_name ON menu_permissions(store, name);

-- 인보이스 (기존 시트 "인보이스") - Date, Target, Type, InvoiceNo
CREATE TABLE IF NOT EXISTS invoices (
  id BIGSERIAL PRIMARY KEY,
  inv_date TEXT NOT NULL,
  target TEXT NOT NULL,
  inv_type TEXT NOT NULL DEFAULT 'Order',
  invoice_no TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(inv_date, target, inv_type)
);
CREATE INDEX IF NOT EXISTS idx_invoices_date ON invoices(inv_date);

-- 평가항목 (평가항목_주방 / 평가항목_서비스) - eval_type: kitchen | service, item_id = 시트 내 번호
CREATE TABLE IF NOT EXISTS evaluation_items (
  id BIGSERIAL PRIMARY KEY,
  eval_type TEXT NOT NULL,
  item_id INT NOT NULL DEFAULT 1,
  main_cat TEXT DEFAULT '',
  sub_cat TEXT DEFAULT '',
  name TEXT DEFAULT '',
  use_flag BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(eval_type, item_id)
);
CREATE INDEX IF NOT EXISTS idx_evaluation_items_type ON evaluation_items(eval_type);

-- 평가결과 (평가결과_주방 / 평가결과_서비스)
CREATE TABLE IF NOT EXISTS evaluation_results (
  id TEXT PRIMARY KEY,
  eval_type TEXT NOT NULL,
  eval_date DATE NOT NULL,
  store_name TEXT NOT NULL,
  employee_name TEXT DEFAULT '',
  evaluator TEXT DEFAULT '',
  final_grade TEXT DEFAULT '',
  memo TEXT DEFAULT '',
  json_data TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_type_date ON evaluation_results(eval_type, eval_date);
CREATE INDEX IF NOT EXISTS idx_evaluation_results_store ON evaluation_results(store_name);

-- RLS 정책 (선택): anon 키로 접근 시 모든 행 허용. 보안 강화 시 나중에 수정.
-- 재실행 시 기존 정책 제거 후 생성 (같은 이름 정책이 있으면 오류 방지)
ALTER TABLE items ENABLE ROW LEVEL SECURITY;
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
ALTER TABLE orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE stock_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE leave_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE notice_reads ENABLE ROW LEVEL SECURITY;
ALTER TABLE work_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_visits ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_holidays ENABLE ROW LEVEL SECURITY;
ALTER TABLE attendance_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE checklist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE check_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE complaint_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE evaluation_results ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all for anon" ON items;
CREATE POLICY "Allow all for anon" ON items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON vendors;
CREATE POLICY "Allow all for anon" ON vendors FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON orders;
CREATE POLICY "Allow all for anon" ON orders FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON stock_logs;
CREATE POLICY "Allow all for anon" ON stock_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON store_settings;
CREATE POLICY "Allow all for anon" ON store_settings FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON employees;
CREATE POLICY "Allow all for anon" ON employees FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON leave_requests;
CREATE POLICY "Allow all for anon" ON leave_requests FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON notices;
CREATE POLICY "Allow all for anon" ON notices FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON notice_reads;
CREATE POLICY "Allow all for anon" ON notice_reads FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON work_logs;
CREATE POLICY "Allow all for anon" ON work_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON store_visits;
CREATE POLICY "Allow all for anon" ON store_visits FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON public_holidays;
CREATE POLICY "Allow all for anon" ON public_holidays FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON attendance_logs;
CREATE POLICY "Allow all for anon" ON attendance_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON schedules;
CREATE POLICY "Allow all for anon" ON schedules FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON payroll_records;
CREATE POLICY "Allow all for anon" ON payroll_records FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON checklist_items;
CREATE POLICY "Allow all for anon" ON checklist_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON check_results;
CREATE POLICY "Allow all for anon" ON check_results FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON complaint_logs;
CREATE POLICY "Allow all for anon" ON complaint_logs FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON menu_permissions;
CREATE POLICY "Allow all for anon" ON menu_permissions FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON invoices;
CREATE POLICY "Allow all for anon" ON invoices FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON evaluation_items;
CREATE POLICY "Allow all for anon" ON evaluation_items FOR ALL USING (true) WITH CHECK (true);
DROP POLICY IF EXISTS "Allow all for anon" ON evaluation_results;
CREATE POLICY "Allow all for anon" ON evaluation_results FOR ALL USING (true) WITH CHECK (true);

-- ============================================================
-- 중복 방지: 전 테이블 유니크 제약
-- ※ 기존에 중복 행이 있으면 먼저 supabase_dedup_once.sql 을 1회 실행한 뒤 아래를 실행하세요.
-- (store_settings, employees, notice_reads, payroll_records, menu_permissions, invoices, evaluation_items 은 CREATE TABLE 시 이미 UNIQUE 있음)
-- ============================================================

-- 품목: code 중복 방지
ALTER TABLE items DROP CONSTRAINT IF EXISTS items_code_key;
ALTER TABLE items ADD CONSTRAINT items_code_key UNIQUE (code);

-- 거래처: code 중복 방지
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_code_key;
ALTER TABLE vendors ADD CONSTRAINT vendors_code_key UNIQUE (code);

-- 직원시간표: 같은 날짜·매장·이름 조합 1건만 허용
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_date_store_name_key;
ALTER TABLE schedules ADD CONSTRAINT schedules_date_store_name_key UNIQUE (schedule_date, store_name, name);

-- 휴가신청: 같은 매장·이름·휴가날짜 1건만
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_store_name_date_key;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_store_name_date_key UNIQUE (store, name, leave_date);

-- 공휴일: 같은 연도·날짜 1건만
ALTER TABLE public_holidays DROP CONSTRAINT IF EXISTS public_holidays_year_date_key;
ALTER TABLE public_holidays ADD CONSTRAINT public_holidays_year_date_key UNIQUE (year, date);

-- 점검결과: 같은 날짜·매장 1건만
ALTER TABLE check_results DROP CONSTRAINT IF EXISTS check_results_date_store_key;
ALTER TABLE check_results ADD CONSTRAINT check_results_date_store_key UNIQUE (check_date, store_name);

-- 매장방문: 하루에 같은 매장 여러 번 방문 허용 (제약 제거)
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_key;
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_type_key;

-- 평가결과: 같은 유형·평가일·매장·직원 1건만
ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_type_date_store_emp_key;
ALTER TABLE evaluation_results ADD CONSTRAINT evaluation_results_type_date_store_emp_key UNIQUE (eval_type, eval_date, store_name, employee_name);

-- 점검항목: item_id + 대중분류 + 항목명 조합 1건만 (표현식 사용으로 유니크 인덱스)
DROP INDEX IF EXISTS checklist_items_item_cat_name_key;
CREATE UNIQUE INDEX checklist_items_item_cat_name_key ON checklist_items (item_id, COALESCE(main_cat,''), COALESCE(sub_cat,''), COALESCE(name,''));

-- 아래는 CREATE TABLE 시 이미 UNIQUE 있는 테이블. 기존 DB에 제약이 빠져 있으면 추가.
ALTER TABLE store_settings DROP CONSTRAINT IF EXISTS store_settings_store_code_key;
ALTER TABLE store_settings ADD CONSTRAINT store_settings_store_code_key UNIQUE (store, code);
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_store_name_key;
ALTER TABLE employees ADD CONSTRAINT employees_store_name_key UNIQUE (store, name);
ALTER TABLE notice_reads DROP CONSTRAINT IF EXISTS notice_reads_notice_id_store_name_key;
ALTER TABLE notice_reads ADD CONSTRAINT notice_reads_notice_id_store_name_key UNIQUE (notice_id, store, name);
ALTER TABLE notices ADD COLUMN IF NOT EXISTS target_recipients TEXT DEFAULT NULL;
ALTER TABLE payroll_records DROP CONSTRAINT IF EXISTS payroll_records_month_store_name_key;
ALTER TABLE payroll_records ADD CONSTRAINT payroll_records_month_store_name_key UNIQUE (month, store, name);
ALTER TABLE menu_permissions DROP CONSTRAINT IF EXISTS menu_permissions_store_name_key;
ALTER TABLE menu_permissions ADD CONSTRAINT menu_permissions_store_name_key UNIQUE (store, name);
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_inv_date_target_inv_type_key;
ALTER TABLE invoices ADD CONSTRAINT invoices_inv_date_target_inv_type_key UNIQUE (inv_date, target, inv_type);
ALTER TABLE evaluation_items DROP CONSTRAINT IF EXISTS evaluation_items_eval_type_item_id_key;
ALTER TABLE evaluation_items ADD CONSTRAINT evaluation_items_eval_type_item_id_key UNIQUE (eval_type, item_id);
