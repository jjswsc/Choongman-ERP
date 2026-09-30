-- Sang Charoen (1014) 매입 지급 중, 입고 총액 − 실지급이
-- 부가세 제외 금액의 3% 와 0.10바트 이내로 맞는 건만 미리보기.
-- 변경 없음. 결과만 확인한 뒤 02를 실행.

WITH inbound AS (
  SELECT
    id,
    vendor_code,
    amount::numeric AS gross,
    CASE
      WHEN trans_date ~ '^\d{4}-\d{2}-\d{2}' THEN left(trans_date, 10)::date
    END AS trans_date
  FROM public.payable_transactions
  WHERE vendor_code = '1014'
    AND ref_type = 'Inbound'
    AND amount > 0
),
pay AS (
  SELECT
    p.id AS payable_id,
    p.bank_transaction_id,
    p.vendor_code,
    abs(p.amount)::numeric AS paid,
    CASE
      WHEN p.trans_date ~ '^\d{4}-\d{2}-\d{2}' THEN left(p.trans_date, 10)::date
    END AS trans_date
  FROM public.payable_transactions p
  WHERE p.vendor_code = '1014'
    AND p.ref_type = 'Payment'
    AND p.amount < 0
    AND p.bank_transaction_id IS NOT NULL
),
pairs AS (
  SELECT
    pay.bank_transaction_id,
    pay.payable_id,
    pay.paid,
    pay.trans_date AS pay_date,
    inbound.id AS inbound_id,
    inbound.gross,
    inbound.trans_date AS inbound_date,
    round((inbound.gross / 1.07) * 0.03, 2) AS theory_wht,
    round(inbound.gross - pay.paid, 2) AS residual_wht
  FROM pay
  JOIN inbound
    ON inbound.vendor_code = pay.vendor_code
   AND pay.trans_date IS NOT NULL
   AND inbound.trans_date IS NOT NULL
   AND pay.trans_date >= inbound.trans_date
   AND pay.trans_date <= inbound.trans_date + 45
   AND (inbound.gross - pay.paid) > 0
   AND abs((inbound.gross - pay.paid) - round((inbound.gross / 1.07) * 0.03, 2)) <= 0.10
),
unique_pairs AS (
  SELECT *
  FROM pairs p
  WHERE (
      SELECT count(*) FROM pairs x WHERE x.bank_transaction_id = p.bank_transaction_id
    ) = 1
    AND (
      SELECT count(*) FROM pairs x WHERE x.inbound_id = p.inbound_id
    ) = 1
)
SELECT
  u.inbound_date,
  u.gross AS inbound_gross,
  u.pay_date,
  u.paid AS bank_paid,
  u.theory_wht,
  u.residual_wht,
  u.bank_transaction_id,
  bt.category AS bank_category,
  bt.memo AS bank_memo,
  bt.withholding_tax_amount AS bank_wht_now,
  EXISTS (
    SELECT 1
    FROM public.payable_transactions w
    WHERE w.bank_transaction_id = u.bank_transaction_id
      AND w.ref_type = 'Withholding'
  ) AS withholding_row_exists
FROM unique_pairs u
LEFT JOIN public.bank_transactions bt ON bt.id = u.bank_transaction_id
ORDER BY u.pay_date, u.bank_transaction_id;
