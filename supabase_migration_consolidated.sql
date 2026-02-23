-- ============================================================
-- Supabase: 통합 마이그레이션 v2 (정리·통합)
-- 사용법: Supabase SQL Editor → 전체 붙여넣기 → Run
--
-- 전제: supabase_schema.sql 로 기본 테이블이 이미 생성된 상태
-- ※ 23505 (duplicate key) 오류 시: supabase_items_dedup_first.sql 먼저 실행 후 재시도
-- ※ 별도 실행: scripts/items_outbound_location_updates.sql, scripts/import_pos_menus_grab.sql
-- ============================================================

-- ========== 1. 중복 데이터 제거 ==========

DELETE FROM items WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(code,'')) ORDER BY id) AS rn FROM items) t WHERE rn > 1);
DELETE FROM vendors WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(code,'')) ORDER BY id) AS rn FROM vendors) t WHERE rn > 1);
DELETE FROM schedules a USING schedules b WHERE a.schedule_date = b.schedule_date AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, '')) AND a.id > b.id;
DELETE FROM leave_requests a USING leave_requests b WHERE TRIM(COALESCE(a.store, '')) = TRIM(COALESCE(b.store, '')) AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, '')) AND a.leave_date = b.leave_date AND a.id > b.id;
DELETE FROM public_holidays a USING public_holidays b WHERE a.year = b.year AND a.date = b.date AND a.id > b.id;
DELETE FROM check_results a USING check_results b WHERE a.check_date = b.check_date AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND a.id > b.id;
DELETE FROM store_visits a USING store_visits b
WHERE a.visit_date = b.visit_date AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, ''))
  AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, ''))
  AND TRIM(COALESCE(a.visit_type, '')) = TRIM(COALESCE(b.visit_type, '')) AND a.id < b.id;
DELETE FROM evaluation_results a USING evaluation_results b WHERE TRIM(COALESCE(a.eval_type, '')) = TRIM(COALESCE(b.eval_type, '')) AND a.eval_date = b.eval_date AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND TRIM(COALESCE(a.employee_name, '')) = TRIM(COALESCE(b.employee_name, '')) AND a.id > b.id;
DELETE FROM checklist_items a USING checklist_items b WHERE a.item_id = b.item_id AND COALESCE(TRIM(a.main_cat), '') = COALESCE(TRIM(b.main_cat), '') AND COALESCE(TRIM(a.sub_cat), '') = COALESCE(TRIM(b.sub_cat), '') AND COALESCE(TRIM(a.name), '') = COALESCE(TRIM(b.name), '') AND a.id > b.id;
DELETE FROM store_settings a USING store_settings b WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.code,'')) = TRIM(COALESCE(b.code,'')) AND a.id > b.id;
DELETE FROM employees a USING employees b WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;
DELETE FROM notice_reads a USING notice_reads b WHERE a.notice_id = b.notice_id AND TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;
DELETE FROM payroll_records a USING payroll_records b WHERE TRIM(COALESCE(a.month,'')) = TRIM(COALESCE(b.month,'')) AND TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;
DELETE FROM menu_permissions a USING menu_permissions b WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;
DELETE FROM invoices a USING invoices b WHERE TRIM(COALESCE(a.inv_date,'')) = TRIM(COALESCE(b.inv_date,'')) AND TRIM(COALESCE(a.target,'')) = TRIM(COALESCE(b.target,'')) AND TRIM(COALESCE(a.inv_type,'')) = TRIM(COALESCE(b.inv_type,'')) AND a.id > b.id;
DELETE FROM evaluation_items a USING evaluation_items b WHERE TRIM(COALESCE(a.eval_type,'')) = TRIM(COALESCE(b.eval_type,'')) AND a.item_id = b.item_id AND a.id > b.id;

-- ========== 2. 유니크 제약 ==========

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
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_key;
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_type_key;
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

-- ========== 3. 기존 테이블 컬럼 추가 ==========

-- orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_indices TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS received_qty_json TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS original_order_qty_json TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_indices TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS approved_original_qty_json TEXT DEFAULT NULL;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS reject_reason TEXT DEFAULT '';

-- employees
ALTER TABLE employees ADD COLUMN IF NOT EXISTS annual_leave_days NUMERIC(5,2) DEFAULT 15;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS bank_name TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS account_number TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS position_allowance NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS haz_allow NUMERIC(12,2) DEFAULT 0;
ALTER TABLE employees ADD COLUMN IF NOT EXISTS grade TEXT DEFAULT '';
ALTER TABLE employees ADD COLUMN IF NOT EXISTS photo TEXT DEFAULT '';

-- items
ALTER TABLE items ADD COLUMN IF NOT EXISTS outbound_location TEXT DEFAULT '';
ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
COMMENT ON COLUMN items.outbound_location IS '출고지 (Jidubang, S&J 등)';
COMMENT ON COLUMN items.description IS '품목 설명 - 모바일 발주·사용 시 신입 직원용 안내';

-- 기타
ALTER TABLE notices ADD COLUMN IF NOT EXISTS target_recipients TEXT DEFAULT NULL;
ALTER TABLE schedules ADD COLUMN IF NOT EXISTS plan_in_prev_day BOOLEAN DEFAULT FALSE;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS certificate_url TEXT DEFAULT '';
ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS user_name TEXT DEFAULT NULL;
ALTER TABLE checklist_items ADD COLUMN IF NOT EXISTS sort_order INT DEFAULT 0;
UPDATE checklist_items SET sort_order = item_id WHERE sort_order IS NULL OR sort_order = 0;

-- ========== 4. 신규 테이블 ==========

-- warehouse_locations
CREATE TABLE IF NOT EXISTS warehouse_locations (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT NOT NULL,
  location_code TEXT NOT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_warehouse_locations_sort ON warehouse_locations(sort_order);

-- purchase_orders
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
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS withholding_tax_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS withholding_tax_rate NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE;
ALTER TABLE purchase_orders ADD COLUMN IF NOT EXISTS invoice_no TEXT DEFAULT NULL;

-- petty_cash_transactions
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

-- pos
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

-- pos_promos, pos_promo_items (프로모션 세트)
CREATE TABLE IF NOT EXISTS pos_promos (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT '프로모션',
  price NUMERIC(12,2) DEFAULT 0,
  price_delivery NUMERIC(12,2),
  vat_included BOOLEAN DEFAULT true,
  sort_order INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_pos_promos_code ON pos_promos(code);
CREATE INDEX IF NOT EXISTS idx_pos_promos_active ON pos_promos(is_active);

CREATE TABLE IF NOT EXISTS pos_promo_items (
  id BIGSERIAL PRIMARY KEY,
  promo_id BIGINT NOT NULL REFERENCES pos_promos(id) ON DELETE CASCADE,
  menu_id BIGINT NOT NULL REFERENCES pos_menus(id) ON DELETE CASCADE,
  option_id BIGINT REFERENCES pos_menu_options(id) ON DELETE SET NULL,
  quantity NUMERIC(10,2) DEFAULT 1,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_promo_items_promo ON pos_promo_items(promo_id);
CREATE INDEX IF NOT EXISTS idx_pos_promo_items_menu ON pos_promo_items(menu_id);

-- pos_coupons
CREATE TABLE IF NOT EXISTS pos_coupons (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT DEFAULT '',
  discount_type TEXT NOT NULL DEFAULT 'fixed' CHECK (discount_type IN ('percent', 'fixed')),
  discount_value NUMERIC(12,2) NOT NULL DEFAULT 0,
  valid_from DATE DEFAULT NULL,
  valid_to DATE DEFAULT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_pos_coupons_code ON pos_coupons(code);
CREATE INDEX IF NOT EXISTS idx_pos_coupons_active ON pos_coupons(is_active);

-- receivable / payable
CREATE TABLE IF NOT EXISTS payable_transactions (
  id BIGSERIAL PRIMARY KEY,
  vendor_code TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  ref_type TEXT NOT NULL DEFAULT 'PO',
  ref_id BIGINT DEFAULT NULL,
  trans_date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payable_vendor ON payable_transactions(vendor_code);
CREATE INDEX IF NOT EXISTS idx_payable_ref ON payable_transactions(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_payable_date ON payable_transactions(trans_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_payable_po_unique ON payable_transactions(ref_type, ref_id) WHERE ref_type = 'PO' AND ref_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS receivable_transactions (
  id BIGSERIAL PRIMARY KEY,
  store_name TEXT NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  ref_type TEXT NOT NULL DEFAULT 'Order',
  ref_id BIGINT DEFAULT NULL,
  trans_date TEXT NOT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_receivable_store ON receivable_transactions(store_name);
CREATE INDEX IF NOT EXISTS idx_receivable_ref ON receivable_transactions(ref_type, ref_id);
CREATE INDEX IF NOT EXISTS idx_receivable_date ON receivable_transactions(trans_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_receivable_order_unique ON receivable_transactions(ref_type, ref_id) WHERE ref_type = 'Order' AND ref_id IS NOT NULL;

-- bank
CREATE TABLE IF NOT EXISTS bank_accounts (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  store TEXT NOT NULL DEFAULT '',
  bank_name TEXT DEFAULT '',
  opening_balance NUMERIC(12,2) DEFAULT 0,
  opening_balance_date DATE DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_accounts_store ON bank_accounts(store);
ALTER TABLE bank_accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for bank_accounts" ON bank_accounts;
CREATE POLICY "Allow all for bank_accounts" ON bank_accounts FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS bank_transactions (
  id BIGSERIAL PRIMARY KEY,
  account_id BIGINT NOT NULL REFERENCES bank_accounts(id) ON DELETE CASCADE,
  trans_date DATE NOT NULL,
  trans_type TEXT NOT NULL DEFAULT 'withdraw',
  amount NUMERIC(12,2) NOT NULL,
  memo TEXT DEFAULT '',
  note TEXT DEFAULT '',
  store TEXT DEFAULT '',
  user_name TEXT DEFAULT '',
  category TEXT DEFAULT 'expense',
  account_subject_id BIGINT DEFAULT NULL,
  sales_date DATE DEFAULT NULL,
  expense_date DATE DEFAULT NULL,
  fixed_expense_id BIGINT DEFAULT NULL,
  vendor_code TEXT DEFAULT NULL,
  store_name TEXT DEFAULT NULL,
  invoice_received BOOLEAN DEFAULT FALSE,
  invoice_no TEXT DEFAULT NULL,
  invoice_photo_url TEXT DEFAULT NULL,
  purchase_order_id BIGINT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- 기존 테이블에 컬럼이 없을 수 있으므로 먼저 추가 (CREATE TABLE IF NOT EXISTS는 기존 테이블 구조 변경 안 함)
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS invoice_no TEXT DEFAULT NULL;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT DEFAULT NULL;
ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS purchase_order_id BIGINT DEFAULT NULL;
COMMENT ON COLUMN bank_transactions.invoice_received IS '인보이스 수령 여부 (매입 대금 건)';
COMMENT ON COLUMN bank_transactions.invoice_no IS '인보이스 번호';
COMMENT ON COLUMN bank_transactions.invoice_photo_url IS '인보이스 사진 URL';
COMMENT ON COLUMN bank_transactions.purchase_order_id IS '연동된 발주서 ID (인보이스 체크 동기화)';
COMMENT ON COLUMN bank_transactions.category IS 'transfer=이체/보충, expense=비용, fixed=고정비, correction=정정, loan=대여, advance=전도금, unclassified=미분류 (손익제외)';
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account ON bank_transactions(account_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_date ON bank_transactions(trans_date);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_store ON bank_transactions(store);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_category ON bank_transactions(category);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_account_subject ON bank_transactions(account_subject_id);
CREATE INDEX IF NOT EXISTS idx_bank_transactions_vendor ON bank_transactions(vendor_code) WHERE vendor_code IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_store_name ON bank_transactions(store_name) WHERE store_name IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_bank_transactions_po ON bank_transactions(purchase_order_id) WHERE purchase_order_id IS NOT NULL;
ALTER TABLE bank_transactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for bank_transactions" ON bank_transactions;
CREATE POLICY "Allow all for bank_transactions" ON bank_transactions FOR ALL USING (true) WITH CHECK (true);

CREATE TABLE IF NOT EXISTS fixed_expenses (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  store TEXT NOT NULL DEFAULT '',
  start_year_month TEXT DEFAULT NULL,
  end_year_month TEXT DEFAULT NULL,
  account_subject_id BIGINT DEFAULT NULL,
  memo TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fixed_expenses_store ON fixed_expenses(store);
ALTER TABLE fixed_expenses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for fixed_expenses" ON fixed_expenses;
CREATE POLICY "Allow all for fixed_expenses" ON fixed_expenses FOR ALL USING (true) WITH CHECK (true);

-- account_subjects
CREATE TABLE IF NOT EXISTS account_subjects (
  id BIGSERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  name_en TEXT DEFAULT NULL,
  type TEXT NOT NULL DEFAULT 'expense',
  p_and_l_section TEXT DEFAULT NULL,
  withholding_tax_rate NUMERIC(5,2) DEFAULT NULL,
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_account_subjects_type ON account_subjects(type);
CREATE INDEX IF NOT EXISTS idx_account_subjects_code ON account_subjects(code);
ALTER TABLE account_subjects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for account_subjects" ON account_subjects;
CREATE POLICY "Allow all for account_subjects" ON account_subjects FOR ALL USING (true) WITH CHECK (true);

-- bank_memo_rules (은행 적요 키워드 → 용도/계정과목)
CREATE TABLE IF NOT EXISTS bank_memo_rules (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  trans_type TEXT NOT NULL CHECK (trans_type IN ('deposit', 'withdraw')),
  category TEXT NOT NULL,
  account_subject_id BIGINT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_memo_rules_trans ON bank_memo_rules(trans_type);
COMMENT ON TABLE bank_memo_rules IS '은행 적요에 키워드 포함 시 지정할 용도/계정과목';

-- bank_memo_mapping_rules (동일 용도, 별도 API에서 사용)
CREATE TABLE IF NOT EXISTS bank_memo_mapping_rules (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  trans_type TEXT NOT NULL CHECK (trans_type IN ('deposit', 'withdraw')),
  category TEXT NOT NULL,
  account_subject_id BIGINT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_bank_memo_mapping_rules_trans ON bank_memo_mapping_rules(trans_type);
COMMENT ON TABLE bank_memo_mapping_rules IS '은행 적요 키워드로 용도·계정과목 자동 매칭 규칙';

-- payable/receivable bank link
ALTER TABLE payable_transactions ADD COLUMN IF NOT EXISTS bank_transaction_id BIGINT DEFAULT NULL;
ALTER TABLE receivable_transactions ADD COLUMN IF NOT EXISTS bank_transaction_id BIGINT DEFAULT NULL;
CREATE INDEX IF NOT EXISTS idx_payable_bank ON payable_transactions(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_receivable_bank ON receivable_transactions(bank_transaction_id) WHERE bank_transaction_id IS NOT NULL;

-- ========== 5. POS/기타 컬럼 추가 ==========

ALTER TABLE bank_transactions ADD COLUMN IF NOT EXISTS invoice_photo_url TEXT DEFAULT NULL;

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
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_cash NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_card NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_qr NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_orders ADD COLUMN IF NOT EXISTS payment_other NUMERIC(12,2) DEFAULT 0;

-- ========== 6. 시드/기본 데이터 ==========

INSERT INTO warehouse_locations (name, address, location_code, sort_order)
SELECT 'Jidubang', 'JIDUBANG(ASIA) 262 3 Bangkok-Chon Buri New Line Rd, Prawet, Bangkok 10250', 'Jidubang', 1
WHERE NOT EXISTS (SELECT 1 FROM warehouse_locations WHERE location_code = 'Jidubang');
INSERT INTO warehouse_locations (name, address, location_code, sort_order)
SELECT 'S&J', 'S&J Global', 'S&J', 2
WHERE NOT EXISTS (SELECT 1 FROM warehouse_locations WHERE location_code = 'S&J');

INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('1110', '현금이체', 'Cash Transfer', 'transfer', NULL, 10),
  ('4110', '배달앱정산', 'Delivery App', 'revenue', 'revenue', 50),
  ('4111', 'Grab', 'Grab', 'revenue', 'revenue', 51),
  ('4112', 'Line Man', 'Line Man', 'revenue', 'revenue', 52),
  ('4113', 'Shopee', 'Shopee', 'revenue', 'revenue', 53),
  ('4114', 'Food Panda', 'Food Panda', 'revenue', 'revenue', 54),
  ('4115', 'Robinhood', 'Robinhood', 'revenue', 'revenue', 55),
  ('4120', '카드매출', 'Card Sales', 'revenue', 'revenue', 60),
  ('4121', 'Visa', 'Visa', 'revenue', 'revenue', 61),
  ('4122', 'Master', 'Master', 'revenue', 'revenue', 62),
  ('4123', 'UnionPay', 'UnionPay', 'revenue', 'revenue', 63),
  ('4124', 'JCB', 'JCB', 'revenue', 'revenue', 64),
  ('4130', 'QR이체매출', 'QR/Transfer', 'revenue', 'revenue', 70),
  ('4140', '현금입금', 'Cash Deposit', 'revenue', 'revenue', 80),
  ('5310', '급여', 'Salary', 'expense', 'expense', 100),
  ('5320', '상여금', 'Bonus', 'expense', 'expense', 101),
  ('5330', '복리후생', 'Welfare', 'expense', 'expense', 102),
  ('5410', '임차료', 'Rent', 'expense', 'fixed', 110),
  ('5420', '통신비', 'Utilities', 'expense', 'fixed', 111),
  ('5430', '전기료', 'Electricity', 'expense', 'fixed', 112),
  ('5440', '수도광열비', 'Water/Gas', 'expense', 'fixed', 113),
  ('5450', '접대비', 'Entertainment', 'expense', 'expense', 120),
  ('5460', '교통비', 'Transportation', 'expense', 'expense', 121),
  ('5461', '차량유지비', 'Vehicles', 'expense', 'expense', 122),
  ('5470', '통신비(전화)', 'Phone', 'expense', 'expense', 123),
  ('5480', '소모품비', 'Supplies', 'expense', 'expense', 130),
  ('5490', '보험료', 'Insurance', 'expense', 'fixed', 131),
  ('5500', '감가상각비', 'Depreciation', 'expense', 'fixed', 132),
  ('5510', '세금공과금', 'Tax/Fees', 'expense', 'expense', 133),
  ('5520', '기타경비', 'Misc Expense', 'expense', 'expense', 199),
  ('5521', '용역비', 'Service costs', 'expense', 'expense', 144),
  ('5522', '연구개발비', 'R&D', 'expense', 'expense', 145),
  ('5523', '수리비', 'Repair fee', 'expense', 'expense', 146),
  ('5524', '홍보비', 'Promotion', 'expense', 'expense', 140),
  ('5525', '광고비', 'Advertising', 'expense', 'expense', 141),
  ('5526', '프로모션비', 'Promo Campaign', 'expense', 'expense', 142),
  ('5527', 'SNS마케팅', 'SNS Marketing', 'expense', 'expense', 143),
  ('5530', '대손상각비', 'Bad Debt Expense', 'expense', 'expense', 147)
ON CONFLICT (code) DO NOTHING;

-- e_tax_submissions (e-Tax 인보이스 제출 이력)
CREATE TABLE IF NOT EXISTS e_tax_submissions (
  id BIGSERIAL PRIMARY KEY,
  ref_type TEXT NOT NULL DEFAULT 'outbound',
  ref_key TEXT NOT NULL,
  invoice_no TEXT,
  invoice_date DATE,
  target_name TEXT,
  total_amount NUMERIC(12,2),
  vat_amount NUMERIC(12,2),
  grand_total NUMERIC(12,2),
  xml_content TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  submitted_at TIMESTAMPTZ,
  response_json JSONB,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_etax_ref ON e_tax_submissions(ref_type, ref_key);
CREATE INDEX IF NOT EXISTS idx_etax_status ON e_tax_submissions(status);
ALTER TABLE e_tax_submissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all for e_tax_submissions" ON e_tax_submissions;
CREATE POLICY "Allow all for e_tax_submissions" ON e_tax_submissions FOR ALL USING (true) WITH CHECK (true);

-- ========== 7. 데이터 수정 ==========

UPDATE orders SET delivery_status = '일부배송완료' WHERE delivery_status = '일부 배송 완료';

-- ========== 8. 인덱스 ==========

CREATE INDEX IF NOT EXISTS idx_items_outbound_location ON items(outbound_location);
CREATE INDEX IF NOT EXISTS idx_attendance_logs_store_name_log_at ON attendance_logs (store_name text_pattern_ops, name text_pattern_ops, log_at);
CREATE INDEX IF NOT EXISTS idx_leave_requests_store_name_date ON leave_requests (store text_pattern_ops, name text_pattern_ops, leave_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_logs_location_log_date ON stock_logs (location, log_date DESC);
CREATE INDEX IF NOT EXISTS idx_pos_menus_sold_out ON pos_menus(sold_out_date);
CREATE INDEX IF NOT EXISTS idx_checklist_items_sort ON checklist_items(sort_order);
