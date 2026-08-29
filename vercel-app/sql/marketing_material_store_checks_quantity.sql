-- 홍보물 매장별 출고 개수
-- Run in Supabase SQL Editor (after marketing_material_store_checks.sql)

ALTER TABLE public.marketing_material_store_checks
  ADD COLUMN IF NOT EXISTS quantity INTEGER NULL;

COMMENT ON COLUMN public.marketing_material_store_checks.quantity IS
  '해당 매장으로 보내는 개수. NULL이면 품목 총수량을 매장 수로 나눈 값으로 표시';
