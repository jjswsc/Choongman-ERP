-- pos_menu_ingredients SELECT RLS (원가 분석·BOM 조회)
-- pos_menus / pos_menu_options 와 동일하게 anon·API(anon 키)에서 읽을 수 있게 함.
-- RLS만 켜고 이 정책이 없으면 getPosMenuCostAnalysis 에서 ingRowsLen=0 → 원가 전부 0.
-- Supabase SQL Editor에서 실행.

DROP POLICY IF EXISTS "Allow select pos_menu_ingredients" ON public.pos_menu_ingredients;
CREATE POLICY "Allow select pos_menu_ingredients" ON public.pos_menu_ingredients
  FOR SELECT USING (true);
