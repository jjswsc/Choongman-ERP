-- ============================================================
-- pos_orders, pos_table_layouts RLS 정책 추가
--
-- RLS 활성화 시 정책이 없으면 anon/service_role 모두 차단될 수 있음.
-- SELECT 허용 정책 추가로 POS 테이블 현황/주문 조회가 동작하도록 함.
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

-- pos_orders: 조회 허용 (POS 주문 목록)
DROP POLICY IF EXISTS "Allow select pos_orders" ON public.pos_orders;
CREATE POLICY "Allow select pos_orders" ON public.pos_orders
  FOR SELECT USING (true);

-- pos_orders: 주문 저장(INSERT) / 수정·상태변경(UPDATE) 허용 (주문 버튼 동작에 필요)
DROP POLICY IF EXISTS "Allow insert pos_orders" ON public.pos_orders;
CREATE POLICY "Allow insert pos_orders" ON public.pos_orders
  FOR INSERT WITH CHECK (true);
DROP POLICY IF EXISTS "Allow update pos_orders" ON public.pos_orders;
CREATE POLICY "Allow update pos_orders" ON public.pos_orders
  FOR UPDATE USING (true) WITH CHECK (true);

-- pos_table_layouts: 조회 허용 (테이블 배치)
DROP POLICY IF EXISTS "Allow select pos_table_layouts" ON public.pos_table_layouts;
CREATE POLICY "Allow select pos_table_layouts" ON public.pos_table_layouts
  FOR SELECT USING (true);

-- pos_menus: 조회 허용 (배달/포장 메뉴)
DROP POLICY IF EXISTS "Allow select pos_menus" ON public.pos_menus;
CREATE POLICY "Allow select pos_menus" ON public.pos_menus
  FOR SELECT USING (true);

-- pos_menu_options: 조회 허용 (메뉴 옵션)
DROP POLICY IF EXISTS "Allow select pos_menu_options" ON public.pos_menu_options;
CREATE POLICY "Allow select pos_menu_options" ON public.pos_menu_options
  FOR SELECT USING (true);

-- pos_menu_ingredients: 조회 허용 (메뉴 BOM·원가 분석 — 정책 없으면 RLS만 켜진 DB에서 anon 조회 시 0행)
DROP POLICY IF EXISTS "Allow select pos_menu_ingredients" ON public.pos_menu_ingredients;
CREATE POLICY "Allow select pos_menu_ingredients" ON public.pos_menu_ingredients
  FOR SELECT USING (true);

-- pos_promos, pos_promo_items: 조회 허용 (프로모션)
DROP POLICY IF EXISTS "Allow select pos_promos" ON public.pos_promos;
CREATE POLICY "Allow select pos_promos" ON public.pos_promos
  FOR SELECT USING (true);
DROP POLICY IF EXISTS "Allow select pos_promo_items" ON public.pos_promo_items;
CREATE POLICY "Allow select pos_promo_items" ON public.pos_promo_items
  FOR SELECT USING (true);
