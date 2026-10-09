-- ============================================================
-- pos_orders RLS: INSERT / UPDATE 허용
--
-- 증상: 주문 시 "new row violates row-level security policy for table pos_orders"
-- 원인: pos_orders에 SELECT만 허용된 상태에서 INSERT/UPDATE 정책 없음.
--
-- 해결 1 (권장): 서버(Vercel API)에서 SUPABASE_SERVICE_ROLE_KEY 사용 시
--               RLS가 우회되어 별도 정책 없이 동작.
--
-- 해결 2: 아래 정책을 적용하면 anon 키로도 주문 저장 가능.
--         Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

-- pos_orders: INSERT 허용 (주문 저장)
DROP POLICY IF EXISTS "Allow insert pos_orders" ON public.pos_orders;
CREATE POLICY "Allow insert pos_orders" ON public.pos_orders
  FOR INSERT WITH CHECK (true);

-- pos_orders: UPDATE 허용 (주문 수정/상태 변경)
DROP POLICY IF EXISTS "Allow update pos_orders" ON public.pos_orders;
CREATE POLICY "Allow update pos_orders" ON public.pos_orders
  FOR UPDATE USING (true) WITH CHECK (true);
