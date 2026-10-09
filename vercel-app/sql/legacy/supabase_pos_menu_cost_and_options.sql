-- ============================================================
-- POS 메뉴 원가·옵션 확장
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 1. 품목(items)에 표준 단위 추가
ALTER TABLE items ADD COLUMN IF NOT EXISTS unit TEXT DEFAULT '';
-- 예: 'kg', 'g', '팩', '개', 'L', 'ml' - pos_menu_ingredients.quantity가 이 단위 기준

-- 2. pos_menu_ingredients에 로스율·옵션 연결 추가
ALTER TABLE pos_menu_ingredients ADD COLUMN IF NOT EXISTS loss_rate NUMERIC(5,2) DEFAULT 0;
-- 0=로스 없음, 10=10% 로스 → 원가 계산 시 quantity * (1 + loss_rate/100) 적용
ALTER TABLE pos_menu_ingredients ADD COLUMN IF NOT EXISTS option_id BIGINT REFERENCES pos_menu_options(id) ON DELETE CASCADE DEFAULT NULL;
-- NULL=기본 메뉴 재료, 값 있음=해당 대체형 옵션 선택 시의 재료
CREATE INDEX IF NOT EXISTS idx_pos_menu_ingredients_option ON pos_menu_ingredients(option_id);

-- 3. pos_menu_options에 추가형 옵션용 품목 연결
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS option_type TEXT DEFAULT 'substitution';
-- 'substitution'=대체형(뼈/순살), 'additive'=추가형(치즈추가, 반반)
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS item_code TEXT DEFAULT NULL;
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS quantity NUMERIC(10,4) DEFAULT 1;
-- additive 옵션 선택 시: item_code × quantity 만큼 추가 차감/원가
