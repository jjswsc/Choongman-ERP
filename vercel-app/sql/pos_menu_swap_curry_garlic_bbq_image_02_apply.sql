-- 2/2 반영 — CURRY ↔ GARLIC Bar.B.Q FRIED CHICKEN 사진(pos_menus.image) 서로 교체
-- pos_orders 는 건드리지 않음 → 영수증·주방 자동인쇄 영향 없음. 영업 중 실행 가능.
-- 메뉴명이 각각 정확히 1건일 때만 실행되고, 아니면 예외로 전체 롤백.
-- 실행 후 POS 화면 새로고침.

BEGIN;

DO $$
DECLARE
  v_curry_id bigint;
  v_garlic_id bigint;
  v_curry_img text;
  v_garlic_img text;
  n int;
BEGIN
  SELECT count(*) INTO n FROM public.pos_menus
  WHERE lower(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g')) = 'curry bar.b.q fried chicken';
  IF n <> 1 THEN
    RAISE EXCEPTION 'CURRY Bar.B.Q FRIED CHICKEN 메뉴가 %건 — 1건이어야 교체합니다', n;
  END IF;

  SELECT count(*) INTO n FROM public.pos_menus
  WHERE lower(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g')) = 'garlic bar.b.q fried chicken';
  IF n <> 1 THEN
    RAISE EXCEPTION 'GARLIC Bar.B.Q FRIED CHICKEN 메뉴가 %건 — 1건이어야 교체합니다', n;
  END IF;

  SELECT id, image INTO v_curry_id, v_curry_img FROM public.pos_menus
  WHERE lower(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g')) = 'curry bar.b.q fried chicken';

  SELECT id, image INTO v_garlic_id, v_garlic_img FROM public.pos_menus
  WHERE lower(regexp_replace(btrim(coalesce(name, '')), '\s+', ' ', 'g')) = 'garlic bar.b.q fried chicken';

  UPDATE public.pos_menus SET image = v_garlic_img WHERE id = v_curry_id;
  UPDATE public.pos_menus SET image = v_curry_img WHERE id = v_garlic_id;

  RAISE NOTICE 'swapped: curry id=% <- garlic image, garlic id=% <- curry image', v_curry_id, v_garlic_id;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_menu_swap_curry_garlic_bbq_image_02_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;

COMMIT;
