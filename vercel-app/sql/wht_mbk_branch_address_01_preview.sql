-- CM MBK 50 ทวิ 상단 주소 점검 (조회만)
-- 본사 True Digital Park 주소가 지점 사업장으로 들어가 있는지 확인합니다.

SELECT
  p.store_code,
  p.taxpayer_name,
  p.place_of_business AS profile_place,
  v.code AS vendor_code,
  v.gps_name,
  v.sales_outlet,
  v.addr AS vendor_addr,
  e.address AS erp_store_address,
  ps.receipt_biz_address,
  w.address AS warehouse_address
FROM public.store_tax_filing_profiles p
LEFT JOIN public.vendors v
  ON v.code = p.vendor_code
  OR lower(trim(coalesce(v.gps_name, ''))) = lower(trim(p.store_code))
  OR lower(trim(coalesce(v.sales_outlet, ''))) = lower(trim(p.store_code))
LEFT JOIN public.erp_stores e
  ON e.store_code = p.store_code
LEFT JOIN public.pos_printer_settings ps
  ON ps.store_code = p.store_code
LEFT JOIN public.warehouse_locations w
  ON lower(trim(w.name)) = lower(trim(p.store_code))
  OR lower(trim(coalesce(w.location_code, ''))) = lower(trim(p.store_code))
WHERE p.store_code ILIKE '%MBK%';
