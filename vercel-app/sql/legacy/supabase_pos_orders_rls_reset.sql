-- ============================================================
-- pos_orders RLS 정책 초기화 후 다시 생성
-- (어제는 됐는데 오늘 42501 나올 때 한 번 실행)
--
-- Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

-- 기존 정책 제거 (이름이 조금 다를 수 있으므로 여러 개 시도)
DROP POLICY IF EXISTS "Allow insert pos_orders" ON public.pos_orders;
DROP POLICY IF EXISTS "Allow update pos_orders" ON public.pos_orders;
DROP POLICY IF EXISTS "pos_orders_allow_update" ON public.pos_orders;

-- SELECT는 그대로 두고, INSERT / UPDATE 만 다시 생성
CREATE POLICY "Allow insert pos_orders" ON public.pos_orders
  FOR INSERT WITH CHECK (true);

CREATE POLICY "Allow update pos_orders" ON public.pos_orders
  FOR UPDATE USING (true) WITH CHECK (true);

-- 확인: 아래 쿼리로 정책 3개 나오면 정상
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'pos_orders';
