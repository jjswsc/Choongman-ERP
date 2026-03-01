-- ============================================================
-- 반반 메뉴: 다른 치킨(S 순살) 2개를 골라 한 상으로 주문. 원가는 각 0.5씩.
-- 사용법: Supabase SQL Editor에서 실행 후, 관리자 > 메뉴 관리에서 Banban Chicken에 "반반 메뉴" 체크.
-- ============================================================

ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS is_banban BOOLEAN DEFAULT false;
COMMENT ON COLUMN pos_menus.is_banban IS '반반 메뉴: POS에서 다른 치킨(S 순살) 2개 선택 → 한 상, 원가 각 0.5';
