-- POS 메뉴 선택 그룹 규칙(JSON) 컬럼
-- 예: [{ "key":"size","label":"Size","required":true,"minSelect":1,"maxSelect":1 }]

alter table if exists public.pos_menus
  add column if not exists option_selection_config jsonb;
