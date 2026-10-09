-- ============================================================
-- 마케팅: 캠페인, 광고 ROAS, 인플루언서
-- 사용법: Supabase 대시보드 > SQL Editor > 붙여넣기 > Run
-- ============================================================

-- 1. 캠페인 마스터
CREATE TABLE IF NOT EXISTS marketing_campaigns (
  id BIGSERIAL PRIMARY KEY,
  topic TEXT NOT NULL,
  format TEXT DEFAULT '',
  status TEXT DEFAULT 'draft',
  detail TEXT DEFAULT '',
  start_date DATE,
  end_date DATE,
  branches JSONB DEFAULT '[]',
  discount_type TEXT DEFAULT 'percent',
  discount_value NUMERIC(12,4) DEFAULT 0,
  discount_price_promotion TEXT DEFAULT '',
  cost_ads_online NUMERIC(12,2) DEFAULT 0,
  cost_ads_offline NUMERIC(12,2) DEFAULT 0,
  cost_production NUMERIC(12,2) DEFAULT 0,
  cost_food NUMERIC(12,2) DEFAULT 0,
  cost_influencer NUMERIC(12,2) DEFAULT 0,
  budget_total NUMERIC(12,2) DEFAULT 0,
  kpi_target NUMERIC(12,2) DEFAULT 0,
  kpi_unit TEXT DEFAULT 'order',
  campaign_performance TEXT DEFAULT '',
  conclusion TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_status ON marketing_campaigns(status);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_dates ON marketing_campaigns(start_date, end_date);
CREATE INDEX IF NOT EXISTS idx_marketing_campaigns_created ON marketing_campaigns(created_at DESC);

COMMENT ON TABLE marketing_campaigns IS '마케팅 캠페인 마스터';
COMMENT ON COLUMN marketing_campaigns.format IS 'Delivery, Dine in, Carry out 또는 조합';
COMMENT ON COLUMN marketing_campaigns.branches IS '참여 지점 배열 ["MBK","Union Mall","Seacon"]';
COMMENT ON COLUMN marketing_campaigns.kpi_unit IS 'order, coupon, member 등';

-- 2. 광고 포스트 (ROAS)
CREATE TABLE IF NOT EXISTS marketing_ads (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  content_format TEXT DEFAULT '',
  content_pillar TEXT DEFAULT '',
  content_topic TEXT DEFAULT '',
  publish_date DATE,
  platform TEXT NOT NULL,
  post_link TEXT DEFAULT '',
  boost_budget NUMERIC(12,2) DEFAULT 0,
  actual_spent NUMERIC(12,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_ads_campaign ON marketing_ads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_ads_platform ON marketing_ads(platform);
CREATE INDEX IF NOT EXISTS idx_marketing_ads_publish ON marketing_ads(publish_date);

COMMENT ON TABLE marketing_ads IS '광고 포스트 (ROAS) - Instagram, Facebook, Tiktok 등';
COMMENT ON COLUMN marketing_ads.platform IS 'instagram, facebook, tiktok, line_oa, twitter';

-- 3. 인플루언서 협업
CREATE TABLE IF NOT EXISTS marketing_influencers (
  id BIGSERIAL PRIMARY KEY,
  campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  followers TEXT DEFAULT '',
  content_format TEXT DEFAULT '',
  content_topic TEXT DEFAULT '',
  status TEXT DEFAULT 'finish',
  branch_review TEXT DEFAULT '',
  hire_type TEXT DEFAULT 'pay',
  budget NUMERIC(12,2) DEFAULT 0,
  shooting_date DATE,
  publish_date DATE,
  platform_links JSONB DEFAULT '{}',
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_marketing_influencers_campaign ON marketing_influencers(campaign_id);
CREATE INDEX IF NOT EXISTS idx_marketing_influencers_branch ON marketing_influencers(branch_review);

COMMENT ON TABLE marketing_influencers IS '인플루언서 협업 이력';
COMMENT ON COLUMN marketing_influencers.platform_links IS '{"instagram":"url","facebook":"url","tiktok":"url"}';
COMMENT ON COLUMN marketing_influencers.hire_type IS 'pay, free';
