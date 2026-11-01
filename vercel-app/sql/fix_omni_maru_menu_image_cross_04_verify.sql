-- Omni 복구 검증(변경 없음): 마루에 남은 타 법인 이미지 / 빈 이미지 건수

SELECT
  count(*) FILTER (
    WHERE trim(coalesce(pm.image, '')) <> ''
      AND pm.image ILIKE '%pos-menu-images%'
      AND (regexp_match(pm.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint IS NOT NULL
      AND (
        (regexp_match(pm.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint <> pm.id
        OR EXISTS (
          SELECT 1
          FROM public.pos_menus owner
          WHERE owner.id = (regexp_match(pm.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint
            AND lower(btrim(coalesce(owner.tenant_id, ''))) <> lower(btrim(coalesce(pm.tenant_id, '')))
        )
      )
  ) AS still_cross_contaminated,
  count(*) FILTER (WHERE trim(coalesce(pm.image, '')) = '') AS empty_image_menus,
  count(*) FILTER (
    WHERE trim(coalesce(pm.image, '')) <> ''
      AND pm.image ILIKE '%pos-menu-images%'
      AND (regexp_match(pm.image, '[0-9]+-([0-9]+)[._]'))[1]::bigint = pm.id
  ) AS own_id_image_menus,
  count(*) AS maru_menu_total
FROM public.pos_menus pm
WHERE lower(btrim(coalesce(pm.tenant_id, ''))) IN ('marubkk', 'marubkk_01');
