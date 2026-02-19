-- ============================================================
-- Supabase: 통합 마이그레이션 (중복 제거 + 유니크 제약 + 컬럼/테이블 추가)
-- 사용법: 전체 선택(Ctrl+A) → 복사 → Supabase SQL Editor 붙여넣기 → Run
--
-- 전제: supabase_schema.sql 로 기본 테이블이 이미 생성된 상태
-- ※ 23505 (duplicate key) 오류 시: supabase_items_dedup_first.sql 먼저 실행 후 재시도
-- ※ 품목 출고지 CSV 적용: scripts/items_outbound_location_updates.sql 별도 실행
-- ※ Grab 메뉴 시드: scripts/import_pos_menus_grab.sql 별도 실행 (선택)
-- ============================================================

-- ========== 1단계: 중복 데이터 제거 (같은 키면 id 큰 행 유지) ==========

DELETE FROM items WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(code,'')) ORDER BY id) AS rn FROM items) t WHERE rn > 1);
DELETE FROM vendors WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(code,'')) ORDER BY id) AS rn FROM vendors) t WHERE rn > 1);
DELETE FROM schedules a USING schedules b WHERE a.schedule_date = b.schedule_date AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, '')) AND a.id > b.id;
DELETE FROM leave_requests a USING leave_requests b WHERE TRIM(COALESCE(a.store, '')) = TRIM(COALESCE(b.store, '')) AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, '')) AND a.leave_date = b.leave_date AND a.id > b.id;
DELETE FROM public_holidays a USING public_holidays b WHERE a.year = b.year AND a.date = b.date AND a.id > b.id;
DELETE FROM check_results a USING check_results b WHERE a.check_date = b.check_date AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND a.id > b.id;

-- store_visits: (visit_date, name, store_name, visit_type) 기준 - 방문시작/방문종료 각 1행 허용
DELETE FROM store_visits a USING store_visits b
WHERE a.visit_date = b.visit_date AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, ''))
  AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, ''))
  AND TRIM(COALESCE(a.visit_type, '')) = TRIM(COALESCE(b.visit_type, ''))
  AND a.id < b.id;

DELETE FROM evaluation_results a USING evaluation_results b WHERE TRIM(COALESCE(a.eval_type, '')) = TRIM(COALESCE(b.eval_type, '')) AND a.eval_date = b.eval_date AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND TRIM(COALESCE(a.employee_name, '')) = TRIM(COALESCE(b.employee_name, '')) AND a.id > b.id;
DELETE FROM checklist_items a USING checklist_items b WHERE a.item_id = b.item_id AND COALESCE(TRIM(a.main_cat), '') = COALESCE(TRIM(b.main_cat), '') AND COALESCE(TRIM(a.sub_cat), '') = COALESCE(TRIM(b.sub_cat), '') AND COALESCE(TRIM(a.name), '') = COALESCE(TRIM(b.name), '') AND a.id > b.id;
DELETE FROM store_settings a USING store_settings b WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.code,'')) = TRIM(COALESCE(b.code,'')) AND a.id > b.id;
DELETE FROM employees a USING employees b WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;
DELETE FROM notice_reads a USING notice_reads b WHERE a.notice_id = b.notice_id AND TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;
DELETE FROM payroll_records a USING payroll_records b WHERE TRIM(COALESCE(a.month,'')) = TRIM(COALESCE(b.month,'')) AND TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;
DELETE FROM menu_permissions a USING menu_permissions b WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;
DELETE FROM invoices a USING invoices b WHERE TRIM(COALESCE(a.inv_date,'')) = TRIM(COALESCE(b.inv_date,'')) AND TRIM(COALESCE(a.target,'')) = TRIM(COALESCE(b.target,'')) AND TRIM(COALESCE(a.inv_type,'')) = TRIM(COALESCE(b.inv_type,'')) AND a.id > b.id;
DELETE FROM evaluation_items a USING evaluation_items b WHERE TRIM(COALESCE(a.eval_type,'')) = TRIM(COALESCE(b.eval_type,'')) AND a.item_id = b.item_id AND a.id > b.id;

-- ========== 2단계: 유니크 제약 추가 ==========

ALTER TABLE items DROP CONSTRAINT IF EXISTS items_code_key;
ALTER TABLE items ADD CONSTRAINT items_code_key UNIQUE (code);
ALTER TABLE vendors DROP CONSTRAINT IF EXISTS vendors_code_key;
ALTER TABLE vendors ADD CONSTRAINT vendors_code_key UNIQUE (code);
ALTER TABLE schedules DROP CONSTRAINT IF EXISTS schedules_date_store_name_key;
ALTER TABLE schedules ADD CONSTRAINT schedules_date_store_name_key UNIQUE (schedule_date, store_name, name);
ALTER TABLE leave_requests DROP CONSTRAINT IF EXISTS leave_requests_store_name_date_key;
ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_store_name_date_key UNIQUE (store, name, leave_date);
ALTER TABLE public_holidays DROP CONSTRAINT IF EXISTS public_holidays_year_date_key;
ALTER TABLE public_holidays ADD CONSTRAINT public_holidays_year_date_key UNIQUE (year, date);
ALTER TABLE check_results DROP CONSTRAINT IF EXISTS check_results_date_store_key;
ALTER TABLE check_results ADD CONSTRAINT check_results_date_store_key UNIQUE (check_date, store_name);

-- store_visits: visit_type 포함 (방문시작 1행 + 방문종료 1행 허용)
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_key;
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_type_key;
ALTER TABLE store_visits ADD CONSTRAINT store_visits_date_name_store_type_key UNIQUE (visit_date, name, store_name, visit_type);

ALTER TABLE evaluation_results DROP CONSTRAINT IF EXISTS evaluation_results_type_date_store_emp_key;
ALTER TABLE evaluation_results ADD CONSTRAINT evaluation_results_type_date_store_emp_key UNIQUE (eval_type, eval_date, store_name, employee_name);
DROP INDEX IF EXISTS checklist_items_item_cat_name_key;
CREATE UNIQUE INDEX checklist_items_item_cat_name_key ON checklist_items (item_id, COALESCE(main_cat,''), COALESCE(sub_cat,''), COALESCE(name,''));
ALTER TABLE store_settings DROP CONSTRAINT IF EXISTS store_settings_store_code_key;
ALTER TABLE store_settings ADD CONSTRAINT store_settings_store_code_key UNIQUE (store, code);
ALTER TABLE employees DROP CONSTRAINT IF EXISTS employees_store_name_key;
ALTER TABLE employees ADD CONSTRAINT employees_store_name_key UNIQUE (store, name);
ALTER TABLE notice_reads DROP CONSTRAINT IF EXISTS notice_reads_notice_id_store_name_key;
ALTER TABLE notice_reads ADD CONSTRAINT notice_reads_notice_id_store_name_key UNIQUE (notice_id, store, name);
ALTER TABLE payroll_records DROP CONSTRAINT IF EXISTS payroll_records_month_store_name_key;
ALTER TABLE payroll_records ADD CONSTRAINT payroll_records_month_store_name_key UNIQUE (month, store, name);
ALTER TABLE menu_permissions DROP CONSTRAINT IF EXISTS menu_permissions_store_name_key;
ALTER TABLE menu_permissions ADD CONSTRAINT menu_permissions_store_name_key UNIQUE (store, name);
ALTER TABLE invoices DROP CONSTRAINT IF EXISTS invoices_inv_date_target_inv_type_key;
ALTER TABLE invoices ADD CONSTRAINT invoices_inv_date_target_inv_type_key UNIQUE (inv_date, target, inv_type);
ALTER TABLE evaluation_items DROP CONSTRAINT IF EXISTS evaluation_items_eval_type_item_id_key;
ALTER TABLE evaluation_items ADD CONSTRAINT evaluation_items_eval_type_item_id_key UNIQUE (eval_type, item_id);

-- ========== 3단계: 컬럼 추가 ==========

-- orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_indices TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_qty_json TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_indices TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_original_qty_json TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_reason TEXT DEFAULT '';

-- employees (annual_leave_days: 입사 1년 이상 6일, 미만 0 — 앱에서 계산. DB는 15 기본값)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC(5,2) DEFAULT 15;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS haz_allow NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo TEXT DEFAULT '';

-- 기타
ALTER TABLE notices ADD COLUMN IF NOT EXISTS target_recipients TEXT DEFAULT NULL;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS plan_in_prev_day BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS certificate_url TEXT DEFAULT '';
ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS user_name TEXT DEFAULT NULL;


-- ========== 4단계: 테이블 생성 (없을 경우) ==========

CREATE TABLE IF NOT EXISTS warehouse_locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  location_code TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_sort ON warehouse_locations(sort_order);

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

CREATE TABLE IF NOT EXISTS petty_cash_transactions (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  trans_date DATE NOT NULL,
  trans_type TEXT NOT NULL DEFAULT 'expense',
  amount NUMERIC(12,2) NOT NULL,
  balance_after NUMERIC(12,2) DEFAULT NULL,
  memo TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_petty_cash_store ON petty_cash_transactions(store);
CREATE INDEX IF NOT EXISTS idx_petty_cash_trans_date ON petty_cash_transactions(trans_date);
ALTER TABLE petty_cash_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for anon" ON petty_cash_transactions;
CREATE POLICY "Allow all for anon" ON petty_cash_transactions FOR ALL USING (true) WITH CHECK (true);
ALTER TABLE petty_cash_transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT DEFAULT NULL;

CREATE TABLE IF NOT EXISTS pos_menus (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '',
  price NUMERIC(12,2) DEFAULT 0,
  image TEXT DEFAULT '',
  vat_included BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_menus_code ON pos_menus(code);
CREATE INDEX IF NOT EXISTS idx_pos_menus_category ON pos_menus(category);
CREATE INDEX IF NOT EXISTS idx_pos_menus_active ON pos_menus(is_active);

CREATE TABLE IF NOT EXISTS pos_menu_options (
  id BIGSERIAL PRIMARY KEY,
  menu_id BIGINT NOT NULL REFERENCES pos_menus(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  price_modifier NUMERIC(12,2) DEFAULT 0,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_menu_options_menu ON pos_menu_options(menu_id);

CREATE TABLE IF NOT EXISTS pos_menu_ingredients (
  id BIGSERIAL PRIMARY KEY,
  menu_id BIGINT NOT NULL REFERENCES pos_menus(id) ON DELETE CASCADE,
  item_code TEXT NOT NULL,
  quantity NUMERIC(10,4) DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_menu_ingredients_menu ON pos_menu_ingredients(menu_id);
CREATE INDEX IF NOT EXISTS idx_pos_menu_ingredients_item ON pos_menu_ingredients(item_code);

CREATE TABLE IF NOT EXISTS pos_orders (
  id BIGSERIAL PRIMARY KEY,
  order_no TEXT NOT NULL,
  store_code TEXT DEFAULT '',
  order_type TEXT DEFAULT 'dine_in',
  table_name TEXT DEFAULT '',
  items_json TEXT NOT NULL DEFAULT '[]',
  subtotal NUMERIC(12,2) DEFAULT 0,
  vat NUMERIC(12,2) DEFAULT 0,
  total NUMERIC(12,2) DEFAULT 0,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_orders_order_no ON pos_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_pos_orders_created ON pos_orders(created_at);
CREATE INDEX IF NOT EXISTS idx_pos_orders_status ON pos_orders(status);
CREATE INDEX IF NOT EXISTS idx_pos_orders_store ON pos_orders(store_code);

CREATE TABLE IF NOT EXISTS pos_table_layouts (
  store_code TEXT NOT NULL PRIMARY KEY,
  layout_json JSONB NOT NULL DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS pos_printer_settings (
  store_code TEXT NOT NULL PRIMARY KEY,
  kitchen_mode INT DEFAULT 1,
  kitchen1_categories JSONB DEFAULT '[]',
  kitchen2_categories JSONB DEFAULT '[]',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ========== 5단계: POS/기타 컬럼 추가 ==========

ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS sold_out_date DATE DEFAULT NULL;
ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS price_delivery NUMERIC(12,2);
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS price_modifier_delivery NUMERIC(12,2);
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS memo TEXT DEFAULT '';
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS discount_amt NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS discount_reason TEXT DEFAULT '';
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS packaging_fee NUMERIC DEFAULT 0;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS auto_stock_deduction BOOLEAN DEFAULT false;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS delivery_fee NUMERIC DEFAULT 0;
ALTER TABLE pos_printer_settings ADD COLUMN IF NOT EXISTS packaging_fee NUMERIC DEFAULT 0;

-- ========== 6단계: 데이터 수정 ==========

UPDATE orders SET delivery_status = '일부배송완료' WHERE delivery_status = '일부 배송 완료';

-- ========== 7단계: 품목 출고지 ==========

ALTER TABLE items ADD COLUMN IF NOT EXISTS outbound_location TEXT DEFAULT '';
COMMENT ON COLUMN items.outbound_location IS '출고지 (Jidubang, S&J 등) - 해당 품목이 출고되는 창고';
INSERT INTO warehouse_locations (name, address, location_code, sort_order)
SELECT 'Jidubang', 'JIDUBANG(ASIA) 262 3 Bangkok-Chon Buri New Line Rd, Prawet, Bangkok 10250', 'Jidubang', 1
WHERE NOT EXISTS (SELECT 1 FROM warehouse_locations WHERE location_code = 'Jidubang');
INSERT INTO warehouse_locations (name, address, location_code, sort_order)
SELECT 'S&J', 'S&J Global', 'S&J', 2
WHERE NOT EXISTS (SELECT 1 FROM warehouse_locations WHERE location_code = 'S&J');
CREATE INDEX IF NOT EXISTS idx_items_outbound_location ON items(outbound_location);

-- ========== 8단계: 성능 인덱스 ==========

CREATE INDEX IF NOT EXISTS idx_attendance_logs_store_name_log_at
  ON attendance_logs (store_name text_pattern_ops, name text_pattern_ops, log_at);
CREATE INDEX IF NOT EXISTS idx_leave_requests_store_name_date
  ON leave_requests (store text_pattern_ops, name text_pattern_ops, leave_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_logs_location_log_date
  ON stock_logs (location, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_pos_menus_sold_out ON pos_menus(sold_out_date);
