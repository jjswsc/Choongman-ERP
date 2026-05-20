-- 프로모션/세트 미러 메뉴(pos_menus.promo_id)의 image 가 비어 있을 때
-- 구성 메뉴(pos_promo_items → pos_menus) 중 이미지를 복사한다.
-- 사이드/밥/음료가 sort_order 상 먼저여도 메인(치킨 등) 이미지를 우선한다.
-- (POS는 미러 메뉴 imageUrl 로 썸네일을 표시)

UPDATE public.pos_menus AS pm
SET image = src.image
FROM (
  SELECT
    mirror.id AS mirror_id,
    coalesce(
      (
        SELECT comp.image
        FROM public.pos_promo_items pi
        JOIN public.pos_menus comp ON comp.id = pi.menu_id
        WHERE pi.promo_id = mirror.promo_id
          AND trim(coalesce(comp.image, '')) <> ''
          AND lower(concat_ws(' ',
            coalesce(comp.code, ''),
            coalesce(comp.name, ''),
            coalesce(comp.category_main, ''),
            coalesce(comp.category, '')
          )) !~ '(side|drink|beverage|rice|무|치킨무|pickled radish|radish|kimchi|음료|사이드|ข้าว|เครื่องดื่ม|กิมจิ|หัวไชเท้า)'
        ORDER BY pi.sort_order ASC NULLS LAST, pi.id ASC
        LIMIT 1
      ),
      (
        SELECT comp.image
        FROM public.pos_promo_items pi
        JOIN public.pos_menus comp ON comp.id = pi.menu_id
        WHERE pi.promo_id = mirror.promo_id
          AND trim(coalesce(comp.image, '')) <> ''
        ORDER BY pi.sort_order ASC NULLS LAST, pi.id ASC
        LIMIT 1
      )
    ) AS image
  FROM public.pos_menus mirror
  WHERE mirror.promo_id IS NOT NULL
    AND trim(coalesce(mirror.image, '')) = ''
) AS src
WHERE pm.id = src.mirror_id
  AND src.image IS NOT NULL
  AND trim(src.image) <> '';

-- 확인: 대분류별 이미지 보유율
-- SELECT category_main,
--        count(*) FILTER (WHERE trim(coalesce(image, '')) <> '') AS with_image,
--        count(*) AS total
-- FROM public.pos_menus
-- WHERE coalesce(is_active, true) = true
-- GROUP BY category_main
-- ORDER BY category_main;
