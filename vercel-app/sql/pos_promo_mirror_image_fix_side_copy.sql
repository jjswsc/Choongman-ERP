-- 미러 메뉴 image가 세트 구성품(밥·치킨 단품 등)과 동일 URL인 경우 비움
-- → POS는 Delivery Ops / 미러에 올린 세트 전용 사진만 표시 (구성품 fallback 없음)
-- 실행 전 pos_promo_mirror_image_audit.sql 로 대상 확인 권장

UPDATE public.pos_menus AS mirror
SET image = ''
WHERE mirror.promo_id IS NOT NULL
  AND trim(coalesce(mirror.image, '')) <> ''
  AND EXISTS (
    SELECT 1
    FROM public.pos_promo_items pi
    JOIN public.pos_menus comp ON comp.id = pi.menu_id
    WHERE pi.promo_id = mirror.promo_id
      AND trim(coalesce(comp.image, '')) <> ''
      AND trim(comp.image) = trim(mirror.image)
  );
