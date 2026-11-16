-- ERP 캠페인 ↔ TikTok Ads 캠페인 매핑 (Meta meta_campaign_* 와 동일 패턴)
-- Run in Supabase SQL Editor after marketing_tiktok_connections.sql

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS tiktok_campaign_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS tiktok_campaign_name TEXT NOT NULL DEFAULT '';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('marketing_tiktok_campaign_map.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
