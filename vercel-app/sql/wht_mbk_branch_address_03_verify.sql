-- CM MBK 세무 프로필 사업장 주소가 들어갔는지 확인

SELECT
  store_code,
  taxpayer_name,
  place_of_business
FROM public.store_tax_filing_profiles
WHERE store_code = 'CM MBK';
