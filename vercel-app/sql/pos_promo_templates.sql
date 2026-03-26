-- 프로모션 세트 템플릿
-- Supabase SQL Editor에서 실행 (멱등)

CREATE TABLE IF NOT EXISTS public.pos_promo_templates (
  id BIGSERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  campaign_id BIGINT NULL,
  category TEXT NOT NULL DEFAULT '',
  channel_hall BOOLEAN NOT NULL DEFAULT TRUE,
  channel_takeout BOOLEAN NOT NULL DEFAULT TRUE,
  channel_delivery BOOLEAN NOT NULL DEFAULT TRUE,
  delivery_app_codes JSONB NULL,
  discount_percent NUMERIC(7,2) NULL,
  default_price NUMERIC(12,2) NULL,
  default_price_delivery NUMERIC(12,2) NULL,
  line_items JSONB NOT NULL DEFAULT '[]',
  note TEXT NULL,
  created_by TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pos_promo_templates_campaign_id
  ON public.pos_promo_templates (campaign_id);

ALTER TABLE public.pos_promo_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all pos_promo_templates" ON public.pos_promo_templates;
CREATE POLICY "Allow all pos_promo_templates"
  ON public.pos_promo_templates
  FOR ALL USING (true) WITH CHECK (true);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pos_promo_templates TO anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.pos_promo_templates_id_seq TO anon, authenticated;
