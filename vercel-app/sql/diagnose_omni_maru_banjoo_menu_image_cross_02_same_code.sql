-- Omni 진단(변경 없음): 동일 메뉴 코드가 마루·반주에 있고 image URL 이 같은지(교차 동기화 흔적)

SELECT
  lower(btrim(code)) AS code_key,
  count(*) AS row_cnt,
  count(DISTINCT tenant_id) AS tenant_cnt,
  count(DISTINCT nullif(trim(image), '')) AS distinct_image_cnt,
  bool_or(lower(btrim(coalesce(tenant_id, ''))) LIKE 'maru%') AS has_maru,
  bool_or(lower(btrim(coalesce(tenant_id, ''))) = 'banjoo') AS has_banjoo,
  max(CASE WHEN lower(btrim(coalesce(tenant_id, ''))) LIKE 'maru%' THEN left(image, 100) END) AS maru_image_sample,
  max(CASE WHEN lower(btrim(coalesce(tenant_id, ''))) = 'banjoo' THEN left(image, 100) END) AS banjoo_image_sample
FROM public.pos_menus
WHERE lower(btrim(coalesce(tenant_id, ''))) IN ('marubkk', 'marubkk_01', 'banjoo')
  AND trim(coalesce(code, '')) <> ''
GROUP BY lower(btrim(code))
HAVING count(DISTINCT tenant_id) > 1
   AND count(DISTINCT nullif(trim(image), '')) = 1
   AND max(nullif(trim(image), '')) IS NOT NULL
ORDER BY code_key;
