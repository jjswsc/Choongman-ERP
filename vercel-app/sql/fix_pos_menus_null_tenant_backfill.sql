-- Omni: pos_menus.tenant_id 가 null 이라 관리자 목록이 비는 경우 복구
-- 1) 먼저 조회만 실행 → tenant 확인 후 2) UPDATE 실행

-- ========== 1) 사전 확인 ==========

-- BC001 이 어디 있는지 (null tenant 목록에 없을 수 있음)
SELECT id, code, name, category_main, tenant_id, is_active, created_at
FROM public.pos_menus
WHERE lower(trim(code)) = 'bc001'
   OR lower(trim(code)) LIKE 'bc%'
ORDER BY id;

-- 매장 1001 의 tenant_id
SELECT store_code, store_name, tenant_id
FROM public.erp_stores
WHERE trim(store_code) = '1001'
   OR lower(trim(store_code)) LIKE '%1001%'
ORDER BY store_code;

-- DB 에 tenant 가 몇 개인지
SELECT nullif(trim(id), '') AS tenant_id, company_name, is_active
FROM public.tenants
WHERE nullif(trim(id), '') IS NOT NULL
ORDER BY 1;

-- ========== 2) 복구 (테넌트가 1개일 때 — 가장 흔함) ==========
-- 아래 블록은 tenants 가 정확히 1개일 때만 안전합니다.
-- 여러 회사이면 3) 수동 지정 UPDATE 를 쓰세요.

DO $$
DECLARE
  tenant_cnt int;
  only_tenant text;
BEGIN
  SELECT count(DISTINCT nullif(trim(id), '')) INTO tenant_cnt FROM public.tenants;
  IF tenant_cnt <> 1 THEN
    RAISE NOTICE 'tenants count = % — skip auto backfill. Use manual UPDATE.', tenant_cnt;
    RETURN;
  END IF;

  SELECT nullif(trim(id), '') INTO only_tenant FROM public.tenants LIMIT 1;
  IF only_tenant IS NULL THEN
    RAISE NOTICE 'no tenant id';
    RETURN;
  END IF;

  UPDATE public.pos_menus
  SET tenant_id = only_tenant
  WHERE coalesce(trim(tenant_id), '') = '';

  RAISE NOTICE 'backfilled pos_menus.tenant_id = %', only_tenant;
END $$;

-- ========== 3) 수동 지정 (테넌트 여러 개일 때) ==========
-- 아래 'YOUR_TENANT_ID' 를 1) 조회 결과의 tenant_id 로 바꾼 뒤 실행
/*
UPDATE public.pos_menus
SET tenant_id = 'YOUR_TENANT_ID'
WHERE coalesce(trim(tenant_id), '') = '';
*/

-- ========== 4) 복구 후 확인 ==========
SELECT id, code, name, tenant_id, is_active
FROM public.pos_menus
ORDER BY id;
