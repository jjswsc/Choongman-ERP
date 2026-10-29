-- Omni 진단: banjoo 매장코드 vs 표시명 (변경 없음)
-- Admin 레이아웃 store_code 와 POS 로그인 store 가 다르면 테이블이 안 보인다.

SELECT
  es.tenant_id,
  es.store_code,
  coalesce(nullif(btrim(es.display_name), ''), '') AS display_name,
  coalesce(es.is_active, true) AS is_active
FROM public.erp_stores es
WHERE lower(btrim(es.tenant_id)) = 'banjoo'
   OR lower(btrim(es.store_code)) = '1000'
   OR lower(btrim(coalesce(es.display_name, ''))) LIKE '%banjoo%'
   OR lower(btrim(coalesce(es.display_name, ''))) LIKE '%sukhumvit%'
ORDER BY es.tenant_id, es.store_code;
