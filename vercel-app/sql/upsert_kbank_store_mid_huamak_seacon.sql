-- 충만 Huamak / Seacon KBank MID 등록 (tenant_store_integrations)
-- Partner ID PTR0000115 는 테넌트/env 공통. 여기에는 매장별 Merchant ID만.
--
-- 실행 전: public.tenants / tenant_store_integrations 테이블이 있어야 함.
-- 테넌트가 없으면 INSERT는 0행일 수 있음 → 앱 코드 기본값(lib/kbank-store-merchant-defaults.ts)이 폴백.

-- 미리보기: 대상 테넌트
SELECT id, company_name, is_active
FROM public.tenants
WHERE is_active IS DISTINCT FROM false
ORDER BY company_name;

-- 업서트 (활성 테넌트 전부에 동일 매장 코드로 넣음 — 충만 단일 테넌트면 1개만 영향)
WITH target_tenants AS (
  SELECT id AS tenant_id
  FROM public.tenants
  WHERE is_active IS DISTINCT FROM false
),
rows AS (
  SELECT *
  FROM (
    VALUES
      ('CM Huamak'::text, 'KB000002340300'::text, 'SJGLB00007'::text, 'CHOONGMAN HUAMAK'::text),
      ('CM Seacon Srinakarin'::text, 'KB000002340299'::text, 'SJGLB00006'::text, 'CHOONGMAN SEACON SQUARE'::text)
  ) AS v(store_code, merchant_id, partner_shop_id, note_label)
)
INSERT INTO public.tenant_store_integrations (
  tenant_id,
  store_code,
  provider,
  is_enabled,
  config_json,
  notes,
  updated_at
)
SELECT
  t.tenant_id,
  r.store_code,
  'kbank',
  true,
  jsonb_build_object(
    'merchantId', r.merchant_id,
    'partnerShopId', r.partner_shop_id,
    'qrEnabled', true
  ),
  r.note_label || ' KBank MID (bank 2026-08)',
  now()
FROM target_tenants t
CROSS JOIN rows r
ON CONFLICT (tenant_id, store_code, provider)
DO UPDATE SET
  is_enabled = EXCLUDED.is_enabled,
  config_json = public.tenant_store_integrations.config_json || EXCLUDED.config_json,
  notes = EXCLUDED.notes,
  updated_at = now();

-- 검증
SELECT tenant_id, store_code, is_enabled, config_json, notes, updated_at
FROM public.tenant_store_integrations
WHERE provider = 'kbank'
  AND store_code IN ('CM Huamak', 'CM Seacon Srinakarin')
ORDER BY store_code, tenant_id;
