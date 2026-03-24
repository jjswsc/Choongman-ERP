-- Marketing hub RLS policies (development-friendly baseline)
-- Run in Supabase SQL Editor when import/save is blocked by RLS.

-- marketing_campaigns
ALTER TABLE IF EXISTS public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_campaigns" ON public.marketing_campaigns;
CREATE POLICY "Allow all marketing_campaigns"
  ON public.marketing_campaigns
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- marketing_ads
ALTER TABLE IF EXISTS public.marketing_ads ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_ads" ON public.marketing_ads;
CREATE POLICY "Allow all marketing_ads"
  ON public.marketing_ads
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- marketing_influencers
ALTER TABLE IF EXISTS public.marketing_influencers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_influencers" ON public.marketing_influencers;
CREATE POLICY "Allow all marketing_influencers"
  ON public.marketing_influencers
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- Optional grants for anon/authenticated roles in dev
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_campaigns TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_ads TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_influencers TO anon, authenticated;
