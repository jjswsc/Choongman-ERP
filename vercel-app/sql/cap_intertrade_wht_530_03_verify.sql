-- C.A.P. Intertrade (1021) 원천세 -530.05 삭제 확인. 변경 없음.
-- payable_left, bank_wht_left, ledger_left, journal_left 가 모두 0이면 삭제된 것이다.

SELECT
  (
    SELECT count(*)
    FROM public.payable_transactions
    WHERE id = 7493
       OR (
         vendor_code = '1021'
         AND ref_type = 'Withholding'
         AND trans_date = '2026-03-20'
         AND amount = -530.05
       )
  ) AS payable_left,
  (
    SELECT COALESCE(withholding_tax_amount, 0)
    FROM public.bank_transactions
    WHERE id = 1815
  ) AS bank_wht_left,
  (
    SELECT count(*)
    FROM public.withholding_tax_ledger_entries
    WHERE source_type = 'bank_transaction'
      AND source_id = 1815
      AND wht_amount = 530.05
  ) AS ledger_left,
  (
    SELECT count(*)
    FROM public.journal_entries
    WHERE source_type = 'bank_purchase_wht'
      AND source_id = 1815
  ) AS journal_left;
