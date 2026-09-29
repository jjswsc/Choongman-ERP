-- 프로모 구성: 같은 메뉴를 선택 그룹마다 따로 저장
-- 구 유니크 (promo_id, menu_id, option) 는 메นหลัก/เมนเสริม 이 달라도 한 줄로 합쳐짐
-- pos_orders 는 건드리지 않음. 인덱스만 교체.

BEGIN;

DROP INDEX IF EXISTS public.ux_pos_promo_items_promo_menu_option;

CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_promo_items_promo_menu_option_group
  ON public.pos_promo_items (
    promo_id,
    menu_id,
    COALESCE(option_id, -1),
    COALESCE(choice_group, '')
  );

COMMIT;
