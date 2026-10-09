-- 매장 이름 통일: 앞에 "CM " 접두사 추가
-- (기존 employees 등은 이미 "CM XXX"로 변경됐으나 schedules 등은 예전 이름이라 시간표 인식 안 됨)
-- Supabase SQL Editor에서 실행

-- [1단계] UNIQUE 제약 충돌 방지: 이미 "CM XXX"가 있으면 구버전("XXX") 행 삭제
DELETE FROM payroll_records pr
WHERE pr.store IS NOT NULL AND pr.store <> '' AND pr.store NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM payroll_records p2 WHERE p2.month = pr.month AND p2.name = pr.name AND p2.store = 'CM ' || TRIM(pr.store));

DELETE FROM employees e
WHERE e.store IS NOT NULL AND e.store <> '' AND e.store NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM employees e2 WHERE e2.name = e.name AND e2.store = 'CM ' || TRIM(e.store));

DELETE FROM schedules s
WHERE s.store_name IS NOT NULL AND s.store_name <> '' AND s.store_name NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM schedules s2 WHERE s2.schedule_date = s.schedule_date AND s2.name = s.name AND s2.store_name = 'CM ' || TRIM(s.store_name));

DELETE FROM leave_requests lr
WHERE lr.store IS NOT NULL AND lr.store <> '' AND lr.store NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM leave_requests l2 WHERE l2.name = lr.name AND l2.leave_date = lr.leave_date AND l2.store = 'CM ' || TRIM(lr.store));

DELETE FROM check_results cr
WHERE cr.store_name IS NOT NULL AND cr.store_name <> '' AND cr.store_name NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM check_results c2 WHERE c2.check_date = cr.check_date AND c2.store_name = 'CM ' || TRIM(cr.store_name));

DELETE FROM evaluation_results er
WHERE er.store_name IS NOT NULL AND er.store_name <> '' AND er.store_name NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM evaluation_results e2 WHERE e2.eval_type = er.eval_type AND e2.eval_date = er.eval_date AND e2.employee_name = er.employee_name AND e2.store_name = 'CM ' || TRIM(er.store_name));

DELETE FROM store_settings ss
WHERE ss.store IS NOT NULL AND ss.store <> '' AND ss.store NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM store_settings s2 WHERE s2.code = ss.code AND s2.store = 'CM ' || TRIM(ss.store));

DELETE FROM menu_permissions mp
WHERE mp.store IS NOT NULL AND mp.store <> '' AND mp.store NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM menu_permissions m2 WHERE m2.name = mp.name AND m2.store = 'CM ' || TRIM(mp.store));

DELETE FROM notice_reads nr
WHERE nr.store IS NOT NULL AND nr.store <> '' AND nr.store NOT LIKE 'CM%'
AND EXISTS (SELECT 1 FROM notice_reads n2 WHERE n2.notice_id = nr.notice_id AND n2.name = nr.name AND n2.store = 'CM ' || TRIM(nr.store));

-- [2단계] 나머지 구버전 매장명에 "CM " 접두사 추가

-- 1. schedules (직원시간표) - 시간표 인식용
UPDATE schedules
SET store_name = 'CM ' || TRIM(store_name)
WHERE store_name IS NOT NULL AND store_name <> '' AND store_name NOT LIKE 'CM%';

-- 2. attendance_logs (출퇴근 기록)
UPDATE attendance_logs
SET store_name = 'CM ' || TRIM(store_name)
WHERE store_name IS NOT NULL AND store_name <> '' AND store_name NOT LIKE 'CM%';

-- 3. leave_requests (휴가 신청)
UPDATE leave_requests
SET store = 'CM ' || TRIM(store)
WHERE store IS NOT NULL AND store <> '' AND store NOT LIKE 'CM%';

-- 4. store_visits (매장 방문)
UPDATE store_visits
SET store_name = 'CM ' || TRIM(store_name)
WHERE store_name IS NOT NULL AND store_name <> '' AND store_name NOT LIKE 'CM%';

-- 5. check_results (점검결과)
UPDATE check_results
SET store_name = 'CM ' || TRIM(store_name)
WHERE store_name IS NOT NULL AND store_name <> '' AND store_name NOT LIKE 'CM%';

-- 6. evaluation_results (평가결과)
UPDATE evaluation_results
SET store_name = 'CM ' || TRIM(store_name)
WHERE store_name IS NOT NULL AND store_name <> '' AND store_name NOT LIKE 'CM%';

-- 7. complaint_logs (불만/민원)
UPDATE complaint_logs
SET store_name = 'CM ' || TRIM(store_name)
WHERE store_name IS NOT NULL AND store_name <> '' AND store_name NOT LIKE 'CM%';

-- 8. employees (직원) - 아직 안 바뀌었을 수 있음
UPDATE employees
SET store = 'CM ' || TRIM(store)
WHERE store IS NOT NULL AND store <> '' AND store NOT LIKE 'CM%';

-- 9. payroll_records (급여)
UPDATE payroll_records
SET store = 'CM ' || TRIM(store)
WHERE store IS NOT NULL AND store <> '' AND store NOT LIKE 'CM%';

-- 10. store_settings
UPDATE store_settings
SET store = 'CM ' || TRIM(store)
WHERE store IS NOT NULL AND store <> '' AND store NOT LIKE 'CM%';

-- 11. menu_permissions (메뉴권한)
UPDATE menu_permissions
SET store = 'CM ' || TRIM(store)
WHERE store IS NOT NULL AND store <> '' AND store NOT LIKE 'CM%';

-- 12. notice_reads (공지 읽음)
UPDATE notice_reads
SET store = 'CM ' || TRIM(store)
WHERE store IS NOT NULL AND store <> '' AND store NOT LIKE 'CM%';
