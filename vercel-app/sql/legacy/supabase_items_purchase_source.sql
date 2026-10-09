-- ============================================================
-- 품목: 본사 전용 vs 매장 전용 구분
-- 코드 있음 = 본사(기존 품목관리), 코드 없음/매장 = 매장 직구
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- purchase_source: 'hq' = 본사 전용(기존 품목), 'store' = 매장 전용(매장 직접 구매)
ALTER TABLE items ADD COLUMN IF NOT EXISTS purchase_source TEXT DEFAULT 'hq';
-- 기존 품목은 모두 본사 전용
UPDATE items SET purchase_source = 'hq' WHERE purchase_source IS NULL OR purchase_source = '';
COMMENT ON COLUMN items.purchase_source IS 'hq=본사전용(코드있음), store=매장전용(매장직구)';
