-- POS 프로모션 조회/구성 성능 및 중복 방지 보강
-- Supabase SQL Editor에서 실행 (멱등)

CREATE INDEX IF NOT EXISTS idx_pos_promos_marketing_campaign_id
  ON public.pos_promos (marketing_campaign_id);

CREATE INDEX IF NOT EXISTS idx_pos_promos_active_sort
  ON public.pos_promos (is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_pos_promo_items_promo_id
  ON public.pos_promo_items (promo_id);

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_promo_items_promo_menu_option
  ON public.pos_promo_items (
    promo_id,
    menu_id,
    COALESCE(option_id, -1)
  );
