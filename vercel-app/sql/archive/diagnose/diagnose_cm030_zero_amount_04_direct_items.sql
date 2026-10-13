-- 4/6 직접정산 거래처로 잡히는 품목 전체 — 출고 내역에서 금액이 0으로 표시되는 범위
-- 매칭: items.vendor(없으면 item_vendors 최우선) = vendors.code / name / gps_name / sales_outlet. SELECT only.

SELECT
  v.code AS vendor_code,
  v.name AS vendor_name,
  i.code,
  i.name,
  i.price AS master_price,
  i.vendor AS item_vendor,
  iv.vendor_code AS item_vendors_top
FROM public.items i
LEFT JOIN LATERAL (
  SELECT x.vendor_code
  FROM public.item_vendors x
  WHERE btrim(x.item_code) = btrim(i.code)
  ORDER BY x.priority DESC
  LIMIT 1
) iv ON true
JOIN public.vendors v
  ON v.direct_settlement = true
  AND btrim(coalesce(nullif(btrim(i.vendor), ''), iv.vendor_code)) IN (
    btrim(coalesce(v.code, '')),
    btrim(coalesce(v.name, '')),
    btrim(coalesce(v.gps_name, '')),
    btrim(coalesce(v.sales_outlet, ''))
  )
ORDER BY v.name, i.code;
