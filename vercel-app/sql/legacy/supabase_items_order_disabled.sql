-- items 테이블에 order_disabled 컬럼 추가
-- true이면 매장 발주 품목 검색에 노출되지 않음
-- 사용법: Supabase 대시보드 > SQL Editor에서 실행

ALTER TABLE items ADD COLUMN IF NOT EXISTS order_disabled BOOLEAN DEFAULT false;
