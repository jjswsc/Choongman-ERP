-- ============================================================
-- pos_orders_rls_bootstrap.sql
-- RLS가 켜져 있는데 정책이 없어 POS 조회/저장이 막힐 때 실행
-- (증상: 주문·테이블·메뉴 목록이 빈 배열, INSERT/UPDATE 실패)
-- 재실행 가능
-- ============================================================

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'pos_orders', 'pos_table_layouts', 'pos_menus', 'pos_menu_options',
    'pos_menu_ingredients', 'pos_promos', 'pos_promo_items'
  ] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    END IF;
  END LOOP;
END $$;

DROP POLICY IF EXISTS "Allow select pos_orders" ON public.pos_orders;
CREATE POLICY "Allow select pos_orders" ON public.pos_orders
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow insert pos_orders" ON public.pos_orders;
CREATE POLICY "Allow insert pos_orders" ON public.pos_orders
  FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Allow update pos_orders" ON public.pos_orders;
CREATE POLICY "Allow update pos_orders" ON public.pos_orders
  FOR UPDATE USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Allow select pos_table_layouts" ON public.pos_table_layouts;
CREATE POLICY "Allow select pos_table_layouts" ON public.pos_table_layouts
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_menus" ON public.pos_menus;
CREATE POLICY "Allow select pos_menus" ON public.pos_menus
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_menu_options" ON public.pos_menu_options;
CREATE POLICY "Allow select pos_menu_options" ON public.pos_menu_options
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_menu_ingredients" ON public.pos_menu_ingredients;
CREATE POLICY "Allow select pos_menu_ingredients" ON public.pos_menu_ingredients
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_promos" ON public.pos_promos;
CREATE POLICY "Allow select pos_promos" ON public.pos_promos
  FOR SELECT USING (true);

DROP POLICY IF EXISTS "Allow select pos_promo_items" ON public.pos_promo_items;
CREATE POLICY "Allow select pos_promo_items" ON public.pos_promo_items
  FOR SELECT USING (true);
