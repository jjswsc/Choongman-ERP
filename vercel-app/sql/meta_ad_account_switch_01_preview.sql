-- Meta 광고 계정 연결 확인 (미리보기만)
-- 잘못된 계정: 2914989841856437 / 올바른 계정: 1942945006154396

SELECT
  id,
  tenant_id,
  page_id,
  page_name,
  ad_account_id,
  last_synced_at,
  updated_at
FROM public.marketing_meta_connections
ORDER BY updated_at DESC NULLS LAST, id DESC
LIMIT 20;
