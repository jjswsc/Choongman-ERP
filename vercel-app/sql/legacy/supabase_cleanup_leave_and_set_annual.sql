-- ============================================================
-- 휴가 정리 + 연차 기본 6일 설정 (한 번에 실행)
-- 실행 전 백업 권장
-- ============================================================

-- 1. 휴가: 오피스 직원 제외, 매장 직원 휴가 신청 내역만 삭제
-- (오피스 = 본사, Office, 오피스, 본점, CM Office, store에 'office' 포함)
DELETE FROM leave_requests
WHERE NOT (
  TRIM(store) = '본사'
  OR TRIM(store) = 'Office'
  OR TRIM(store) = '오피스'
  OR TRIM(store) = '본점'
  OR TRIM(store) = 'CM Office'
  OR LOWER(TRIM(store)) LIKE '%office%'
);

-- 2. 연차 기본 6일 (입사일 무관, 전 직원)
UPDATE employees SET annual_leave_days = 6;

-- 3. 컬럼 기본값 6 (신규 직원)
ALTER TABLE employees ALTER COLUMN annual_leave_days SET DEFAULT 6;
