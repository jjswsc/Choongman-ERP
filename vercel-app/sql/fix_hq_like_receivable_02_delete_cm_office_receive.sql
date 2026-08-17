-- 2/2 CM Office 가짜 수령 삭제 (rec 1569 / Dishwasher JR Inter Progress)
-- 통장 연결 없는 수동 수령만. 지출·통장 원장은 건드리지 않음
-- 이것만 복사 → Run
DELETE FROM public.receivable_transactions
WHERE id = 1569
  AND ref_type = 'Receive'
  AND store_name = 'CM Office'
  AND amount = -2824.80
  AND COALESCE(receive_checked, false) = false
  AND bank_transaction_id IS NULL
RETURNING id, store_name, amount, memo
