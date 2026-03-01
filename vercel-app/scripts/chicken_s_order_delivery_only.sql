-- ============================================================
-- 치킨 메뉴: S 사이즈(기본 S 순살)는 배달에서만 판매
-- 홀/포장에서는 S 순살 옵션 비노출·비선택. 배달에서만 "기본 (S 순살)" 사용.
-- 사용법: Supabase SQL Editor에서 실행.
-- ============================================================

-- 컬럼이 없으면 추가 (한 번만 실행하면 됨)
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_hall BOOLEAN DEFAULT true;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_delivery BOOLEAN DEFAULT true;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS sell_packaging BOOLEAN DEFAULT true;

UPDATE pos_menu_options o
SET sell_hall = false,
    sell_packaging = false,
    sell_delivery = true
FROM pos_menus m
WHERE o.menu_id = m.id
  AND LOWER(TRIM(COALESCE(m.code, ''))) LIKE 'c%'
  AND (
    TRIM(COALESCE(o.name, '')) IN ('S 순살', 'S - 순살', 'S-순살')
    OR (TRIM(COALESCE(o.name, '')) ILIKE 's%순살' AND LENGTH(TRIM(COALESCE(o.name, ''))) < 20)
  );
