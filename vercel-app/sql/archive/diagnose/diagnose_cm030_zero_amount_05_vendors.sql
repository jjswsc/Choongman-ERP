-- 5/6 CM030에 연결된 거래처 두 곳 비교 (items.vendor = 1065 Siam Food Services, item_vendors 최우선 = 1017)
-- 직접정산 체크가 어느 쪽에 켜져 있는지 확인. SELECT only.

SELECT
  v.code,
  v.name,
  v.gps_name,
  v.sales_outlet,
  v.direct_settlement
FROM public.vendors v
WHERE btrim(v.code) IN ('1017', '1065')
   OR btrim(v.name) = 'Siam Food Services Ltd.'
ORDER BY v.code;
