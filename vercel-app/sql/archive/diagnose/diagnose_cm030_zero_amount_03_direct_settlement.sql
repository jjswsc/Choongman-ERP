-- 3/3 CM030 거래처가 "직접정산" 거래처인지 확인
-- 출고 내역 API는 직접정산 거래처 품목의 금액을 강제로 0 처리한다(getDirectSettlementMap).
-- 매칭 기준: items.vendor(없으면 item_vendors 최우선) = vendors.code / name / gps_name / sales_outlet. SELECT only.

SELECT
  i.code,
  i.name,
  i.price AS master_price,
  i.vendor AS item_vendor,
  iv.vendor_code AS item_vendors_top,
  v.code AS vendor_code,
  v.name AS vendor_name,
  v.direct_settlement
FROM public.items i
LEFT JOIN LATERAL (
  SELECT x.vendor_code
  FROM public.item_vendors x
  WHERE btrim(x.item_code) = btrim(i.code)
  ORDER BY x.priority DESC
  LIMIT 1
) iv ON true
LEFT JOIN public.vendors v
  ON btrim(coalesce(nullif(btrim(i.vendor), ''), iv.vendor_code)) IN (
    btrim(coalesce(v.code, '')),
    btrim(coalesce(v.name, '')),
    btrim(coalesce(v.gps_name, '')),
    btrim(coalesce(v.sales_outlet, ''))
  )
WHERE upper(btrim(coalesce(i.code, ''))) = 'CM030';
