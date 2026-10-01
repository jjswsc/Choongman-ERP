-- TikTok Ads 연결 (access token · advertiser · last sync)
-- Run in Supabase SQL Editor
-- 영업 중 POS 관련 테이블이 아님. marketing 전용.

CREATE TABLE IF NOT EXISTS public.marketing_tiktok_connections (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  advertiser_id TEXT NOT NULL DEFAULT '',
  advertiser_name TEXT NOT NULL DEFAULT '',
  access_token_enc TEXT NOT NULL DEFAULT '',
  granted_scopes TEXT NOT NULL DEFAULT '',
  last_synced_at TIMESTAMPTZ,
  last_sync_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_tiktok_connections_tenant
  ON public.marketing_tiktok_connections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_marketing_tiktok_connections_advertiser
  ON public.marketing_tiktok_connections(advertiser_id);

ALTER TABLE public.marketing_tiktok_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all marketing_tiktok_connections" ON public.marketing_tiktok_connections;
CREATE POLICY "Allow all marketing_tiktok_connections"
  ON public.marketing_tiktok_connections
  FOR ALL USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_tiktok_connections TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketing_tiktok_connections_id_seq TO anon, authenticated;

ALTER TABLE IF EXISTS public.marketing_ads
  ADD COLUMN IF NOT EXISTS tiktok_ad_id TEXT;
