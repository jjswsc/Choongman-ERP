-- 3/4 미리보기: 발생 #2316 · 통장 #10403 연결(미지급 Payment/Expense, 내부통장 여부)
-- 조회만. 삭제 금지.
-- is_internal_bank = true 이면 지출관리에서 만든 통장(CSV 아님) → 통장 행도 같이 지울 수 있음.
-- false 이면 실제 은행 출금일 가능성 → 통장은 남기고 지급예정만 지움.

SELECT
  pt.id AS payable_id,
  pt.ref_type,
  pt.amount,
  pt.expense_accrual_id,
  pt.bank_transaction_id,
  pt.petty_cash_transaction_id,
  left(coalesce(pt.memo, ''), 120) AS payable_memo,
  bt.id AS bank_id,
  left(bt.trans_date::text, 10) AS bank_date,
  bt.trans_type,
  bt.amount AS bank_amount,
  bt.category AS bank_category,
  bt.document_no AS bank_document_no,
  left(coalesce(bt.memo, ''), 80) AS bank_memo,
  left(coalesce(bt.note, ''), 160) AS bank_note,
  (coalesce(bt.note, '') ILIKE '%source:expense_internal%') AS is_internal_bank
FROM public.payable_transactions pt
LEFT JOIN public.bank_transactions bt
  ON bt.id = pt.bank_transaction_id
WHERE pt.expense_accrual_id = 2316
   OR pt.bank_transaction_id = 10403
ORDER BY pt.id;
