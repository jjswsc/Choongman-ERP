-- ============================================================
-- 배합(sauces)이 DB에는 있는데 앱 목록만 0건일 때 (선택)
--
-- 원인: RLS가 켜져 있고(예: supabase_enable_rls_all_tables.sql),
--       Next API가 SUPABASE_ANON_KEY만 쓰면 PostgREST가 행을 돌려주지 않을 수 있음.
--
-- 권장 해결: Vercel·로컬 서버 환경에 SUPABASE_SERVICE_ROLE_KEY 설정
--           → 서버가 service_role로 접근하면 RLS를 우회해 기존 데이터가 조회됨.
--
-- 아래는 anon에게 SELECT만 허용하는 예시(내부 원가 데이터 노출에 유의).
-- 필요할 때만 Supabase SQL Editor에서 실행하고, 정책 이름은 프로젝트에 맞게 조정하세요.
-- ============================================================

ALTER TABLE public.sauces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sauce_ingredients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sauces_select_anon_read" ON public.sauces;
CREATE POLICY "sauces_select_anon_read" ON public.sauces
  FOR SELECT TO anon
  USING (true);

DROP POLICY IF EXISTS "sauce_ingredients_select_anon_read" ON public.sauce_ingredients;
CREATE POLICY "sauce_ingredients_select_anon_read" ON public.sauce_ingredients
  FOR SELECT TO anon
  USING (true);
