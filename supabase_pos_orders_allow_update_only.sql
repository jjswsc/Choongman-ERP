-- pos_orders UPDATE 정책만 추가 (INSERT는 이미 있음)
DROP POLICY IF EXISTS "Allow update pos_orders" ON public.pos_orders;
CREATE POLICY "Allow update pos_orders" ON public.pos_orders
  FOR UPDATE USING (true) WITH CHECK (true);
