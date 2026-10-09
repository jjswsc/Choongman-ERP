-- ============================================================
-- Supabase 중복 데이터 1회 제거 스크립트 (전 테이블)
-- 사용법: Supabase 대시보드 > SQL Editor에서 이 파일 내용 붙여넣기 후 Run
-- 실행 후 supabase_schema.sql 의 "중복 방지: 전 테이블 유니크 제약" 블록을 실행하세요.
-- ============================================================

-- 품목: code 기준 중복 제거 (id 작은 행만 유지)
DELETE FROM items a
USING items b
WHERE a.code = b.code AND a.id > b.id;

-- 거래처: code 기준 중복 제거
DELETE FROM vendors a
USING vendors b
WHERE a.code = b.code AND a.id > b.id;

-- 직원시간표: (날짜, 매장, 이름) 기준 중복 제거
DELETE FROM schedules a
USING schedules b
WHERE a.schedule_date = b.schedule_date
  AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, ''))
  AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, ''))
  AND a.id > b.id;

-- 휴가신청: (매장, 이름, 휴가날짜) 기준 중복 제거
DELETE FROM leave_requests a
USING leave_requests b
WHERE TRIM(COALESCE(a.store, '')) = TRIM(COALESCE(b.store, ''))
  AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, ''))
  AND a.leave_date = b.leave_date
  AND a.id > b.id;

-- 공휴일: (연도, 날짜) 기준 중복 제거
DELETE FROM public_holidays a
USING public_holidays b
WHERE a.year = b.year AND a.date = b.date AND a.id > b.id;

-- 점검결과: (날짜, 매장) 기준 중복 제거 (id가 TEXT이므로 id 비교)
DELETE FROM check_results a
USING check_results b
WHERE a.check_date = b.check_date
  AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, ''))
  AND a.id > b.id;

-- 매장방문: (방문일, 이름, 방문매장) 기준 중복 제거
DELETE FROM store_visits a
USING store_visits b
WHERE a.visit_date = b.visit_date
  AND TRIM(COALESCE(a.name, '')) = TRIM(COALESCE(b.name, ''))
  AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, ''))
  AND a.id > b.id;

-- 평가결과: (유형, 평가일, 매장, 직원) 기준 중복 제거
DELETE FROM evaluation_results a
USING evaluation_results b
WHERE TRIM(COALESCE(a.eval_type, '')) = TRIM(COALESCE(b.eval_type, ''))
  AND a.eval_date = b.eval_date
  AND TRIM(COALESCE(a.store_name, '')) = TRIM(COALESCE(b.store_name, ''))
  AND TRIM(COALESCE(a.employee_name, '')) = TRIM(COALESCE(b.employee_name, ''))
  AND a.id > b.id;

-- 점검항목: (item_id, 대분류, 중분류, 항목명) 기준 중복 제거
DELETE FROM checklist_items a
USING checklist_items b
WHERE a.item_id = b.item_id
  AND COALESCE(TRIM(a.main_cat), '') = COALESCE(TRIM(b.main_cat), '')
  AND COALESCE(TRIM(a.sub_cat), '') = COALESCE(TRIM(b.sub_cat), '')
  AND COALESCE(TRIM(a.name), '') = COALESCE(TRIM(b.name), '')
  AND a.id > b.id;

-- 아래는 CREATE TABLE 시 이미 UNIQUE가 있는 테이블. 과거 데이터 중복 시에만 1회 실행.
-- 매장설정: (store, code)
DELETE FROM store_settings a USING store_settings b
WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.code,'')) = TRIM(COALESCE(b.code,'')) AND a.id > b.id;

-- 직원정보: (store, name)
DELETE FROM employees a USING employees b
WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;

-- 공지확인: (notice_id, store, name)
DELETE FROM notice_reads a USING notice_reads b
WHERE a.notice_id = b.notice_id AND TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;

-- 급여: (month, store, name)
DELETE FROM payroll_records a USING payroll_records b
WHERE TRIM(COALESCE(a.month,'')) = TRIM(COALESCE(b.month,'')) AND TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;

-- 메뉴권한: (store, name)
DELETE FROM menu_permissions a USING menu_permissions b
WHERE TRIM(COALESCE(a.store,'')) = TRIM(COALESCE(b.store,'')) AND TRIM(COALESCE(a.name,'')) = TRIM(COALESCE(b.name,'')) AND a.id > b.id;

-- 인보이스: (inv_date, target, inv_type)
DELETE FROM invoices a USING invoices b
WHERE TRIM(COALESCE(a.inv_date,'')) = TRIM(COALESCE(b.inv_date,'')) AND TRIM(COALESCE(a.target,'')) = TRIM(COALESCE(b.target,'')) AND TRIM(COALESCE(a.inv_type,'')) = TRIM(COALESCE(b.inv_type,'')) AND a.id > b.id;

-- 평가항목: (eval_type, item_id)
DELETE FROM evaluation_items a USING evaluation_items b
WHERE TRIM(COALESCE(a.eval_type,'')) = TRIM(COALESCE(b.eval_type,'')) AND a.item_id = b.item_id AND a.id > b.id;
