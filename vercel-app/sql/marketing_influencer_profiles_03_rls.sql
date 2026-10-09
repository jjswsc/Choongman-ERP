-- 인플루언서 명부 3/4: RLS·권한 (marketing_campaigns_rls_policies.sql 과 동일 패턴)
-- 02 실행 후 Run

ALTER TABLE IF EXISTS public.marketing_influencer_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_influencer_profiles" ON public.marketing_influencer_profiles;
CREATE POLICY "Allow all marketing_influencer_profiles"
  ON public.marketing_influencer_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_influencer_profiles TO anon, authenticated;
