-- Store 1001 / 2026-09-23 영업 시작(시재) 저장 여부 확인
-- 영수증: POS opening report, Cash in drawer 0.00, 09:38:37
SELECT
  store_code,
  settle_date,
  cash_actual,
  cash_actual_denoms,
  closed,
  updated_at
FROM pos_settlements
WHERE store_code IN ('1001', '1001 ')
   OR store_code ILIKE '%1001%'
ORDER BY settle_date DESC, updated_at DESC NULLS LAST
LIMIT 20;
