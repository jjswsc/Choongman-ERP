-- 4/5 สาขาซื้อเอง / CM Office 가 erp_stores 실매장인지
-- SELECT만. 이것만 복사 → Run
SELECT id, store_code, store_name, is_active
FROM public.erp_stores
WHERE store_name ILIKE '%ซื้อเอง%'
   OR store_name ILIKE '%office%'
   OR store_name ILIKE '%본사%'
ORDER BY store_name
