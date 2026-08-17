-- 1/2 สาขาซื้อเอง 가짜 미수 삭제 (rec 565 / APO20260511-89 / Pepsi 매입)
-- 통장 연결·수금확인 없으면 1행 삭제되고 그 행이 결과로 보임
-- 이것만 복사 → Run
DELETE FROM public.receivable_transactions
WHERE id = 565
  AND ref_type = 'AccountingPO'
  AND invoice_no = 'APO20260511-89'
  AND COALESCE(receive_checked, false) = false
  AND bank_transaction_id IS NULL
RETURNING id, store_name, invoice_no, amount, memo
