-- Omni: ABC Company / Marubkk 중 HQ 가 없는 테넌트에만 기존 본사 행 복사
-- 다른 Omni 테넌트에는 넣지 않습니다 (세무정보 유출 방지).
-- 실행 전: 03 unique 에서 ux_vendors_tenant_code 확인.
-- vendors_code_key UNIQUE(code) 가 남아 있으면 실패합니다 → inventory_tenant_id.sql 먼저.
-- 충만 레거시 DB에는 실행하지 마세요. vendors 만 변경 (pos_orders 아님).

INSERT INTO public.vendors (
  type,
  code,
  name,
  tax_id,
  addr,
  phone,
  memo,
  tenant_id
)
SELECT
  '본사',
  'HQ',
  coalesce(nullif(trim(hq.name), ''), 'Head Office'),
  coalesce(hq.tax_id, ''),
  coalesce(hq.addr, ''),
  coalesce(hq.phone, ''),
  coalesce(hq.memo, ''),
  t.id
FROM public.tenants t
CROSS JOIN LATERAL (
  SELECT *
  FROM public.vendors
  WHERE upper(trim(coalesce(code, ''))) = 'HQ'
     OR type IN ('본사', 'Head Office')
  ORDER BY id DESC
  LIMIT 1
) hq
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
  );
