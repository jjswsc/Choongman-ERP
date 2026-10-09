-- E1) receivable 쪽 Huamak 유사 매장명
SELECT DISTINCT store_name
FROM receivable_transactions
WHERE store_name ILIKE '%huamak%'
   OR store_name ILIKE '%hua mak%'
   OR store_name ILIKE '%หัวหมาก%'
ORDER BY 1;
