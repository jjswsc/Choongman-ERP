-- ============================================================
-- 매장 전용 품목 → 카테고리 "매장 전용"으로 통일
-- 품목 관리/모바일에서 카테고리로 조회할 수 있도록
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

UPDATE items
SET category = '매장 전용'
WHERE purchase_source = 'store'
  AND (category IS NULL OR category = '' OR category != '매장 전용');
