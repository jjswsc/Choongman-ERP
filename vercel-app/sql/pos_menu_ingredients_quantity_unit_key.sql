-- BOM 입력 단위 저장 (원가 계산기에서 선택한 ml/g/kg/ea 등)
-- Supabase SQL Editor에서 1회 실행

alter table public.pos_menu_ingredients
  add column if not exists quantity_unit_key text;

comment on column public.pos_menu_ingredients.quantity_unit_key is
  '원가 계산기 입력 단위. 형식 unit::totalQuantity (예 g::1, kg::1000). quantity는 음식=g·포장=ea 기준.';
