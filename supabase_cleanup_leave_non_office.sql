-- 휴가 관리: 오피스 직원 제외, 매장 직원 휴가 신청 내역만 삭제
-- 오피스 = 본사, Office, 오피스, 본점, CM Office, 또는 store에 'office' 포함
-- 실행 전 백업 권장

DELETE FROM leave_requests
WHERE NOT (
  TRIM(store) = '본사'
  OR TRIM(store) = 'Office'
  OR TRIM(store) = '오피스'
  OR TRIM(store) = '본점'
  OR TRIM(store) = 'CM Office'
  OR LOWER(TRIM(store)) LIKE '%office%'
);
