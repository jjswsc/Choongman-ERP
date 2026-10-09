-- 연차일(annual_leave_days) DB값 초기화
-- Supabase SQL Editor에서 실행
-- NULL로 두면 앱이 입사일 기준 자동 계산:
--   입사 1년 미만: 0일, 1년차: 6일, 2년차: 7일, 3년차: 8일 ... (5+년차)
-- 주의: 0으로 두면 '직접 입력'으로 인식되어 연차가 0으로 나올 수 있음. NULL 사용 권장.

-- (1) 오피스 직원 제외, 매장 직원만 재계산
UPDATE employees
SET annual_leave_days = NULL
WHERE NOT (
  store IN ('본사', 'Office', '오피스', '본점', 'CM Office')
  OR LOWER(COALESCE(TRIM(store), '')) LIKE '%office%'
);

-- (2) 전 직원 재계산하려면 아래 주석 해제
-- UPDATE employees SET annual_leave_days = NULL;
