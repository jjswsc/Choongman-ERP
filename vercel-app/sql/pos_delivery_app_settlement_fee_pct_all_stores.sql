-- 전 매장 동일 플랫폼 정산 수수료(%): Grab 20, LINE MAN 18, Shopee 13
-- 선행: pos_delivery_app_settlement_fee_pct.sql (settlement_fee_pct 컬럼)

WITH store_list AS (
  SELECT DISTINCT trim(store_code) AS store_code
  FROM (
    SELECT store_code FROM public.erp_stores WHERE coalesce(is_active, true)
    UNION ALL
    SELECT store_code FROM public.pos_delivery_app_policies
    UNION ALL
    SELECT store_code FROM public.pos_orders WHERE trim(coalesce(store_code, '')) <> ''
    UNION ALL
    SELECT trim(store) AS store_code
    FROM public.employees
    WHERE trim(coalesce(store, '')) <> ''
  ) u
  WHERE trim(store_code) <> ''
    AND lower(trim(store_code)) NOT IN ('all', '전체')
),
app_rates (app_code, settlement_fee_pct) AS (
  VALUES
    ('grab', 20.00::numeric),
    ('lineman', 18.00::numeric),
    ('shopee', 13.00::numeric)
)
INSERT INTO public.pos_delivery_app_policies (
  store_code,
  app_code,
  enabled,
  order_acceptance_mode,
  settlement_fee_pct,
  updated_at
)
SELECT
  s.store_code,
  r.app_code,
  true,
  'manual',
  r.settlement_fee_pct,
  now()
FROM store_list s
CROSS JOIN app_rates r
ON CONFLICT (store_code, app_code)
DO UPDATE SET
  settlement_fee_pct = EXCLUDED.settlement_fee_pct,
  updated_at = now();
