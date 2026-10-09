-- ============================================================
-- 품목 출고지(outbound_location) 추가
-- 배송지 → 출고지 용어 정리: 품목별로 출고되는 창고(Jidubang, S&J 등)
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

ALTER TABLE items ADD COLUMN IF NOT EXISTS outbound_location TEXT DEFAULT '';

COMMENT ON COLUMN items.outbound_location IS '출고지 (Jidubang, S&J 등) - 해당 품목이 출고되는 창고';

-- warehouse_locations에 Jidubang, S&J 추가 (없을 경우)
INSERT INTO warehouse_locations (name, address, location_code, sort_order)
SELECT 'Jidubang', 'JIDUBANG(ASIA) 262 3 Bangkok-Chon Buri New Line Rd, Prawet, Bangkok 10250', 'Jidubang', 1
WHERE NOT EXISTS (SELECT 1 FROM warehouse_locations WHERE location_code = 'Jidubang');

INSERT INTO warehouse_locations (name, address, location_code, sort_order)
SELECT 'S&J', 'S&J Global', 'S&J', 2
WHERE NOT EXISTS (SELECT 1 FROM warehouse_locations WHERE location_code = 'S&J');

CREATE INDEX IF NOT EXISTS idx_items_outbound_location ON items(outbound_location);
