-- Omni: vendors 본사(Head Office / HQ) 행 — tenant_id 가 비면 전 회사가 같은 행을 봄
-- 충만 레거시 DB에는 실행하지 마세요.

SELECT
  v.id,
  v.tenant_id,
  v.code,
  v.type,
  v.name,
  v.tax_id,
  v.phone,
  left(coalesce(v.addr, ''), 80) AS addr_preview,
  left(coalesce(v.memo, ''), 80) AS memo_preview,
  t.company_name
FROM public.vendors v
LEFT JOIN public.tenants t ON t.id = v.tenant_id
WHERE upper(trim(coalesce(v.code, ''))) = 'HQ'
   OR v.type IN ('본사', 'Head Office')
   OR lower(coalesce(v.type, '')) LIKE '%head office%'
ORDER BY coalesce(v.tenant_id, ''), v.id;
