-- pos_promos, pos_coupons에 marketing_campaign_id 추가
-- 사용법: Supabase SQL Editor에서 실행

ALTER TABLE pos_promos ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pos_promos_campaign ON pos_promos(marketing_campaign_id);

ALTER TABLE pos_coupons ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT REFERENCES marketing_campaigns(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_pos_coupons_campaign ON pos_coupons(marketing_campaign_id);

COMMENT ON COLUMN pos_promos.marketing_campaign_id IS '연계 마케팅 캠페인';
COMMENT ON COLUMN pos_coupons.marketing_campaign_id IS '연계 마케팅 캠페인';
