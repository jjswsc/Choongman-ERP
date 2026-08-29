-- Facebook Page에 연결된 Instagram + ERP 캠페인↔Meta 광고 캠페인 매핑
-- Run in Supabase SQL Editor after marketing_meta_connections.sql

ALTER TABLE IF EXISTS public.marketing_meta_connections
  ADD COLUMN IF NOT EXISTS ig_user_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS ig_username TEXT NOT NULL DEFAULT '';

ALTER TABLE IF EXISTS public.marketing_campaigns
  ADD COLUMN IF NOT EXISTS meta_campaign_id TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS meta_campaign_name TEXT NOT NULL DEFAULT '';
