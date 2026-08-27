-- CM MBK 50 ทวิ 사업장 주소: 본사(True Digital Park) 값을 지점 주소로 교체
-- 거래처 addr → erp_stores.address → 영수증 주소 → 창고 주소 순으로 본사가 아닌 값을 넣습니다.
-- 미리보기(01)에서 지점 주소가 보이는지 확인한 뒤에만 실행하세요.

UPDATE public.store_tax_filing_profiles p
SET
  place_of_business = src.branch_address,
  updated_at = now(),
  updated_by = coalesce(nullif(trim(p.updated_by), ''), 'wht_mbk_branch_address')
FROM (
  SELECT DISTINCT ON (p.store_code)
    p.store_code,
    coalesce(
      nullif(trim(CASE
        WHEN coalesce(v.addr, '') ILIKE '%true digital park%' THEN NULL
        ELSE v.addr
      END), ''),
      nullif(trim(CASE
        WHEN coalesce(e.address, '') ILIKE '%true digital park%' THEN NULL
        ELSE e.address
      END), ''),
      nullif(trim(CASE
        WHEN coalesce(ps.receipt_biz_address, '') ILIKE '%true digital park%' THEN NULL
        ELSE ps.receipt_biz_address
      END), ''),
      nullif(trim(CASE
        WHEN coalesce(w.address, '') ILIKE '%true digital park%' THEN NULL
        ELSE w.address
      END), '')
    ) AS branch_address
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
  WHERE p.store_code ILIKE '%MBK%'
  ORDER BY
    p.store_code,
    CASE WHEN v.code = p.vendor_code THEN 0 ELSE 1 END
) src
WHERE p.store_code = src.store_code
  AND coalesce(trim(src.branch_address), '') <> ''
  AND (
    coalesce(trim(p.place_of_business), '') = ''
    OR p.place_of_business ILIKE '%true digital park%'
  )
RETURNING p.store_code, p.taxpayer_name, p.place_of_business;
