-- 오피스(본사) 급여가 지출관리에 직원별로 남아 있는지 점검.
-- 배포 후: 급여 관리에서 해당 월 오피스 급여를 「확정 저장」하면
--   · 합산 1건(payroll-YYYY-MM-…-agg) 생성/갱신
--   · planned/approved 직원별 행은 자동 삭제
-- paid 된 직원별 행이 있으면 합산을 건너뛰므로 수동 확인 필요.

-- 1) 해당 월 오피스 급여 지출 행 목록
-- month 접두만 바꿔서 사용 (예: 2026-07)
SELECT
  id,
  store_name,
  payee_name,
  payee_code,
  status,
  amount,
  memo,
  expense_date,
  CASE
    WHEN payee_code ILIKE '%-agg::wm::expense' THEN 'aggregate'
    ELSE 'individual'
  END AS row_kind
FROM expense_accruals
WHERE payee_code ILIKE 'payroll-2026-07-%::wm::expense'
  AND (
    store_name ILIKE '%office%'
    OR store_name IN ('본사', 'HQ', 'Office', '오피스', '본점', 'CM Office')
  )
ORDER BY row_kind, payee_name;

-- 2) 합산 vs 개인 건수·금액
SELECT
  CASE
    WHEN payee_code ILIKE '%-agg::wm::expense' THEN 'aggregate'
    ELSE 'individual'
  END AS row_kind,
  status,
  COUNT(*) AS row_count,
  SUM(amount) AS amount_sum
FROM expense_accruals
WHERE payee_code ILIKE 'payroll-2026-07-%::wm::expense'
  AND (
    store_name ILIKE '%office%'
    OR store_name IN ('본사', 'HQ', 'Office', '오피스', '본점', 'CM Office')
  )
GROUP BY 1, 2
ORDER BY 1, 2;
