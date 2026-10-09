-- E2) erp_stores Huamak 마스터
SELECT id, store_code, display_name
FROM erp_stores
WHERE store_code ILIKE '%huamak%'
   OR display_name ILIKE '%huamak%'
   OR store_code ILIKE '%hua%mak%'
   OR display_name ILIKE '%hua%mak%'
ORDER BY id;
