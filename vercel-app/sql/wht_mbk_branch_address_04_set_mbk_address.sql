-- CM MBK 사업장 주소를 거래처/영수증에 있는 MBK 주소로 직접 저장
-- 확인(03)에서 place_of_business 가 비어 있을 때만 실행

UPDATE public.store_tax_filing_profiles
SET
  place_of_business = 'No. 444, 7th Floor, Room B2 MBK Center Phaya Thai Road
Wang Mai Subdistrict, Pathum Wan District
Bangkok 10330 Thailand',
  updated_at = now(),
  updated_by = coalesce(nullif(trim(updated_by), ''), 'wht_mbk_branch_address')
WHERE store_code = 'CM MBK'
  AND (
    coalesce(trim(place_of_business), '') = ''
    OR place_of_business ILIKE '%true digital park%'
  )
RETURNING store_code, taxpayer_name, place_of_business;
