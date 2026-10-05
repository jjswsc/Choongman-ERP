-- Meta 광고 계정 변경 후 확인

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
