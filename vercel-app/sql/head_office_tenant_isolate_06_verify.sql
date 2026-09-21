-- Omni: 테넌트별 Head Office 행 검증
-- 충만 레거시 DB에는 실행하지 마세요.

SELECT
  t.id AS tenant_id,
  t.company_name,
  count(v.id) AS hq_row_count,
  string_agg(v.id::text, ',' ORDER BY v.id) AS vendor_ids,
  max(v.name) AS hq_name,
  max(v.tax_id) AS hq_tax_id
FROM public.tenants t
LEFT JOIN public.vendors v
  ON v.tenant_id = t.id
 AND (
   upper(trim(coalesce(v.code, ''))) = 'HQ'
   OR v.type IN ('본사', 'Head Office')
 )
WHERE coalesce(t.is_active, true) = true
  AND (
    lower(coalesce(t.company_name, '')) LIKE '%abc%'
    OR lower(coalesce(t.company_name, '')) LIKE '%maru%'
    OR lower(coalesce(t.id, '')) LIKE '%abc%'
    OR lower(coalesce(t.id, '')) LIKE '%maru%'
  )
GROUP BY t.id, t.company_name
ORDER BY t.company_name, t.id;
