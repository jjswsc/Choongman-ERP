-- Omni / 매장 1001 · Parin Promvihan · 2026-09-17 휴가 중복 확인 (조회만)
-- employee_id 없는 DB에서도 실행되도록 기본 컬럼만 사용
SELECT
  id,
  store,
  name,
  type,
  leave_date,
  status,
  reason,
  created_at
FROM leave_requests
WHERE store = '1001'
  AND name ILIKE '%Parin Promvihan%'
  AND leave_date = DATE '2026-09-17'
ORDER BY id;
