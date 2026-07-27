-- POS 협업 할인 — pos_orders.collab_discount_amt (+ marketing_campaign_id 인덱스 보강)
-- Supabase SQL Editor에서 실행. marketing_campaign_id 컬럼은 marketing_campaign_hub_extensions.sql 참고.

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS collab_discount_amt numeric(14, 2) NOT NULL DEFAULT 0;

ALTER TABLE public.pos_orders
  ADD COLUMN IF NOT EXISTS marketing_campaign_id BIGINT NULL;

COMMENT ON COLUMN public.pos_orders.collab_discount_amt IS
  '협업(제휴) POS 할인 금액. 결제 할인 층 — 사용 현황 집계용.';
COMMENT ON COLUMN public.pos_orders.marketing_campaign_id IS
  '적용한 마케팅 캠페인 ID(협업 할인 등). marketing_campaigns.id';

CREATE INDEX IF NOT EXISTS idx_pos_orders_campaign_id
  ON public.pos_orders (marketing_campaign_id);

CREATE INDEX IF NOT EXISTS idx_pos_orders_collab_usage
  ON public.pos_orders (marketing_campaign_id, created_at)
  WHERE marketing_campaign_id IS NOT NULL AND collab_discount_amt > 0;
