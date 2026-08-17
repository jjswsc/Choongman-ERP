-- 2/5 CM Office·본사 미수 행 + 통장 연결
-- SELECT만. 이것만 복사 → Run
SELECT
  rt.id AS rec_id,
  rt.trans_date,
  rt.store_name,
  rt.ref_type,
  rt.ref_id,
  rt.invoice_no,
  rt.amount,
  rt.memo,
  rt.receive_checked,
  rt.bank_transaction_id,
  b.trans_date AS bank_date,
  b.amount AS bank_amount,
  b.memo AS bank_memo,
  b.category AS bank_category,
  b.store_name AS bank_store,
  b.account_id
FROM public.receivable_transactions rt
LEFT JOIN public.bank_transactions b
  ON b.id = rt.bank_transaction_id
WHERE rt.store_name ILIKE '%office%'
   OR rt.store_name ILIKE '%본사%'
   OR rt.store_name ILIKE '%오피스%'
ORDER BY rt.trans_date, rt.id
