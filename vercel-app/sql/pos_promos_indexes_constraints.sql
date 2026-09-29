-- POS 프로모션 조회/구성 성능 및 중복 방지 보강
-- Supabase SQL Editor에서 실행 (멱등)

CREATE INDEX IF NOT EXISTS idx_pos_promos_marketing_campaign_id
  ON public.pos_promos (marketing_campaign_id);

CREATE INDEX IF NOT EXISTS idx_pos_promos_active_sort
  ON public.pos_promos (is_active, sort_order, name);

CREATE INDEX IF NOT EXISTS idx_pos_promo_items_promo_id
  ON public.pos_promo_items (promo_id);

-- 같은 메뉴·옵션이라도 선택 그룹(choice_group)이 다르면 별도 행.
-- 구 인덱스(그룹 무시)가 남아 있으면 메인/사이드에 같은 메뉴를 넣어도 한 줄로 합쳐진다.
DROP INDEX IF EXISTS public.ux_pos_promo_items_promo_menu_option;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_promo_items_promo_menu_option_group
  ON public.pos_promo_items (
    promo_id,
    menu_id,
    COALESCE(option_id, -1),
    COALESCE(choice_group, '')
  );
