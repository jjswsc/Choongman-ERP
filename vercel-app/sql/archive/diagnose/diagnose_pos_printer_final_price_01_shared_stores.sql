-- Omni 진단: Final Price(서비스비·반올림)가 같은 매장코드를 쓰는 다른 법인과 섞이는지 확인
-- 미리보기만. 변경 없음.
-- banjoo·marubkk_01 처럼 store_code 가 겹치면 저장/조회가 서로 덮어쓰거나 잘못 보일 수 있음.

SELECT
  lower(btrim(es.store_code)) AS store_code,
  count(DISTINCT es.tenant_id)::int AS tenant_count,
  string_agg(DISTINCT es.tenant_id, ', ' ORDER BY es.tenant_id) AS tenant_ids,
  string_agg(
    DISTINCT coalesce(nullif(btrim(es.display_name), ''), es.store_code),
    ' | '
    ORDER BY coalesce(nullif(btrim(es.display_name), ''), es.store_code)
  ) AS store_labels
FROM public.erp_stores es
WHERE nullif(btrim(es.tenant_id), '') IS NOT NULL
  AND nullif(btrim(es.store_code), '') IS NOT NULL
GROUP BY lower(btrim(es.store_code))
HAVING count(DISTINCT es.tenant_id) > 1
ORDER BY store_code;
