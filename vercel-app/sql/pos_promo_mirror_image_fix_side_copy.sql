-- 미러 메뉴 image가 밥/사이드 구성품과 동일하게 들어간 경우 보정
-- (pos_menu_sync_mirror_image_from_promo_items.sql 구버전·sort_order 첫 행이 밥일 때 발생)
-- 실행 전 pos_promo_mirror_image_audit.sql B) 로 대상 확인 권장

UPDATE public.pos_menus AS mirror
SET image = fix.preferred_image
FROM (
  SELECT
    m.id AS mirror_id,
    (
      SELECT comp.image
      FROM public.pos_promo_items pi
      JOIN public.pos_menus comp ON comp.id = pi.menu_id
      WHERE pi.promo_id = m.promo_id
        AND trim(coalesce(comp.image, '')) <> ''
        AND lower(concat_ws(' ',
          coalesce(comp.code, ''),
          coalesce(comp.name, ''),
          coalesce(comp.category_main, ''),
          coalesce(comp.category, '')
        )) !~ '(side|drink|beverage|rice|무|치킨무|pickled radish|radish|kimchi|음료|사이드|ข้าว|เครื่องดื่ม|กิมจิ|หัวไชเท้า)'
      ORDER BY pi.sort_order ASC NULLS LAST, pi.id ASC
      LIMIT 1
    ) AS preferred_image
  FROM public.pos_menus m
  WHERE m.promo_id IS NOT NULL
    AND trim(coalesce(m.image, '')) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.pos_promo_items pi
      JOIN public.pos_menus comp ON comp.id = pi.menu_id
      WHERE pi.promo_id = m.promo_id
        AND trim(coalesce(comp.image, '')) <> ''
        AND trim(comp.image) = trim(m.image)
        AND lower(concat_ws(' ',
          coalesce(comp.code, ''),
          coalesce(comp.name, ''),
          coalesce(comp.category_main, ''),
          coalesce(comp.category, '')
        )) ~ '(side|drink|beverage|rice|무|치킨무|pickled radish|radish|kimchi|음료|사이드|ข้าว|เครื่องดื่ม|กิมจิ|หัวไชเท้า)'
    )
) AS fix
WHERE mirror.id = fix.mirror_id
  AND fix.preferred_image IS NOT NULL
  AND trim(fix.preferred_image) <> ''
  AND trim(fix.preferred_image) <> trim(coalesce(mirror.image, ''));

-- preferred_image 가 없으면(메인 구성품 사진 없음) 미러 image 를 비워 fallback 규칙에 맡김
UPDATE public.pos_menus AS mirror
SET image = ''
FROM (
  SELECT m.id AS mirror_id
  FROM public.pos_menus m
  WHERE m.promo_id IS NOT NULL
    AND trim(coalesce(m.image, '')) <> ''
    AND EXISTS (
      SELECT 1
      FROM public.pos_promo_items pi
      JOIN public.pos_menus comp ON comp.id = pi.menu_id
      WHERE pi.promo_id = m.promo_id
        AND trim(coalesce(comp.image, '')) <> ''
        AND trim(comp.image) = trim(m.image)
        AND lower(concat_ws(' ',
          coalesce(comp.code, ''),
          coalesce(comp.name, ''),
          coalesce(comp.category_main, ''),
          coalesce(comp.category, '')
        )) ~ '(side|drink|beverage|rice|무|치킨무|pickled radish|radish|kimchi|음료|사이드|ข้าว|เครื่องดื่ม|กิมจิ|หัวไชเท้า)'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.pos_promo_items pi
      JOIN public.pos_menus comp ON comp.id = pi.menu_id
      WHERE pi.promo_id = m.promo_id
        AND trim(coalesce(comp.image, '')) <> ''
        AND lower(concat_ws(' ',
          coalesce(comp.code, ''),
          coalesce(comp.name, ''),
          coalesce(comp.category_main, ''),
          coalesce(comp.category, '')
        )) !~ '(side|drink|beverage|rice|무|치킨무|pickled radish|radish|kimchi|음료|사이드|ข้าว|เครื่องดื่ม|กิมจิ|หัวไชเท้า)'
    )
) AS clear_row
WHERE mirror.id = clear_row.mirror_id;
