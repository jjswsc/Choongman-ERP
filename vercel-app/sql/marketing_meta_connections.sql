-- Meta / Facebook 연결 (Page token · Ad account · last sync)
-- Run in Supabase SQL Editor

CREATE TABLE IF NOT EXISTS public.marketing_meta_connections (
  id BIGSERIAL PRIMARY KEY,
  tenant_id TEXT,
  page_id TEXT NOT NULL DEFAULT '',
  page_name TEXT NOT NULL DEFAULT '',
  ad_account_id TEXT NOT NULL DEFAULT '',
  page_token_enc TEXT NOT NULL DEFAULT '',
  user_token_enc TEXT NOT NULL DEFAULT '',
  token_expires_at TIMESTAMPTZ,
  granted_scopes TEXT NOT NULL DEFAULT '',
  token_kind TEXT NOT NULL DEFAULT 'page',
  last_synced_at TIMESTAMPTZ,
  last_sync_json JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_marketing_meta_connections_tenant
  ON public.marketing_meta_connections(tenant_id);

CREATE INDEX IF NOT EXISTS idx_marketing_meta_connections_page
  ON public.marketing_meta_connections(page_id);

ALTER TABLE public.marketing_meta_connections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow all marketing_meta_connections" ON public.marketing_meta_connections;
CREATE POLICY "Allow all marketing_meta_connections"
  ON public.marketing_meta_connections
  FOR ALL USING (true) WITH CHECK (true);

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_meta_connections TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.marketing_meta_connections_id_seq TO anon, authenticated;

ALTER TABLE IF EXISTS public.marketing_ads
  ADD COLUMN IF NOT EXISTS meta_ad_id TEXT;
