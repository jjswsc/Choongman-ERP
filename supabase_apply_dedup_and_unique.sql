-- ============================================================
-- Supabase: 중복 제거 + 유니크 제약 한 번에 적용
-- 사용법: 이 파일 전체 선택(Ctrl+A) → 복사 → Supabase SQL Editor에 붙여넣기 → Run
--
-- ※ 23505 (duplicate key) 오류가 나면: 아래 "items만 먼저" 블록만 복사해서
--    한 번 실행한 뒤, 그 다음 이 파일 전체를 다시 실행하세요.
-- ============================================================

-- [옵션] items 중복만 먼저 제거하고 제약 걸기 (오류 시 이것만 먼저 실행)
-- DELETE FROM items WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(code,'')) ORDER BY id) AS rn FROM items) t WHERE rn > 1);
-- ALTER TABLE items DROP CONSTRAINT IF EXISTS items_code_key;
-- ALTER TABLE items ADD CONSTRAINT items_code_key UNIQUE (code);

-- ========== 1단계: 중복 데이터 제거 (같은 키면 id 작은 행만 유지) ==========
-- items, vendors: code 기준 (ROW_NUMBER로 명시적 제거)
DELETE FROM items WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(code,'')) ORDER BY id) AS rn FROM items) t WHERE rn > 1);
DELETE FROM vendors WHERE id IN (SELECT id FROM (SELECT id, ROW_NUMBER() OVER (PARTITION BY TRIM(COALESCE(code,'')) ORDER BY id) AS rn FROM vendors) t WHERE rn > 1);
DELETE FROM schedules a USING schedules b WHERE a.schedule_date = b.schedule_date AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, '')) AND a.id > b.id;
DELETE FROM leave_requests a USING leave_requests b WHERE TRIM(COALESCE(a.store, '')) = TRIM(COALESCE(b.store, '')) AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, '')) AND a.leave_date = b.leave_date AND a.id > b.id;
DELETE FROM public_holidays a USING public_holidays b WHERE a.year = b.year AND a.date = b.date AND a.id > b.id;
DELETE FROM check_results a USING check_results b WHERE a.check_date = b.check_date AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND a.id > b.id;
DELETE FROM store_visits a USING store_visits b WHERE a.visit_date = b.visit_date AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, '')) AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, '')) AND a.id > b.id;
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
ALTER TABLE store_visits DROP CONSTRAINT IF EXISTS store_visits_date_name_store_key;
ALTER TABLE store_visits ADD CONSTRAINT store_visits_date_name_store_key UNIQUE (visit_date, name, store_name);
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
