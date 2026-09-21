-- Omni: ABC Company / Marubkk 중 HQ 행이 없는 테넌트 미리보기 (05 복사 대상)
-- 템플릿은 기존 HQ 행 중 id 가 가장 큰 행입니다.
-- 다른 Omni 테넌트에는 복사하지 않습니다.
-- 충만 레거시 DB에는 실행하지 마세요.

WITH hq AS (
  SELECT *
  FROM public.vendors
  WHERE upper(trim(coalesce(code, ''))) = 'HQ'
     OR type IN ('본사', 'Head Office')
  ORDER BY id DESC
  LIMIT 1
),
tenants_missing AS (
  SELECT t.id AS tenant_id, t.company_name
  FROM public.tenants t
  WHERE coalesce(t.is_active, true) = true
    AND (
      lower(coalesce(t.company_name, '')) LIKE '%abc%'
      OR lower(coalesce(t.company_name, '')) LIKE '%maru%'
      OR lower(coalesce(t.id, '')) LIKE '%abc%'
      OR lower(coalesce(t.id, '')) LIKE '%maru%'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.vendors v
      WHERE v.tenant_id = t.id
        AND (
          upper(trim(coalesce(v.code, ''))) = 'HQ'
          OR v.type IN ('본사', 'Head Office')
        )
    )
)
SELECT
  m.tenant_id,
  m.company_name,
  hq.id AS template_vendor_id,
  hq.tenant_id AS template_tenant_id,
  hq.name AS template_name,
  hq.tax_id AS template_tax_id
FROM tenants_missing m
CROSS JOIN hq
ORDER BY m.company_name, m.tenant_id;
