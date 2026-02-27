-- ============================================================
-- POS 옵션 단계별 선택 (사이즈 → 순살/뼈 등)
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 1. pos_menus: 옵션 선택 단계 순서 (예: ["size","bone"])
ALTER TABLE pos_menus ADD COLUMN IF NOT EXISTS option_selection_groups JSONB DEFAULT '[]';
COMMENT ON COLUMN pos_menus.option_selection_groups IS '옵션 선택 단계. 예: ["size","bone"] → 1단계 사이즈, 2단계 뼈/순살';

-- 2. pos_menu_options: 각 옵션의 단계별 값 (복합 옵션용)
ALTER TABLE pos_menu_options ADD COLUMN IF NOT EXISTS option_step_values JSONB DEFAULT NULL;
COMMENT ON COLUMN pos_menu_options.option_step_values IS '복합 옵션의 단계별 값. 예: {"size":"M","bone":"순살"} → M 사이즈 + 순살';
