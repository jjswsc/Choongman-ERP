-- items 테이블에서 tax가 "면세"인 항목을 모두 "과세"로 변경
-- 사용법: Supabase 대시보드 > SQL Editor에서 실행

UPDATE items
SET tax = '과세'
WHERE tax = '면세';
