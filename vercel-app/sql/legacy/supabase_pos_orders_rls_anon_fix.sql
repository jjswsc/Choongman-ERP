-- ============================================================
-- pos_orders RLS 42501 해결: anon 역할에 권한 + 정책 명시
--
-- 정책은 있는데도 42501 나오면, anon에 GRANT가 없거나
-- 정책이 anon에 적용되지 않았을 수 있음.
--
-- Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

-- 1) 스키마/테이블 권한 (anon이 INSERT/UPDATE 할 수 있게)
GRANT USAGE ON SCHEMA public TO anon;
GRANT SELECT, INSERT, UPDATE ON public.pos_orders TO anon;

-- 2) 기존 정책 제거 후 anon용으로 다시 생성
DROP POLICY IF EXISTS "Allow insert pos_orders" ON public.pos_orders;
DROP POLICY IF EXISTS "Allow update pos_orders" ON public.pos_orders;
DROP POLICY IF EXISTS "pos_orders_allow_update" ON public.pos_orders;

CREATE POLICY "Allow insert pos_orders"
  ON public.pos_orders
  FOR INSERT
  TO anon
  WITH CHECK (true);

CREATE POLICY "Allow update pos_orders"
  ON public.pos_orders
  FOR UPDATE
  TO anon
  USING (true)
  WITH CHECK (true);

-- 3) SELECT 정책도 anon 명시 (주문 조회용)
DROP POLICY IF EXISTS "Allow select pos_orders" ON public.pos_orders;
CREATE POLICY "Allow select pos_orders"
  ON public.pos_orders
  FOR SELECT
  TO anon
  USING (true);
