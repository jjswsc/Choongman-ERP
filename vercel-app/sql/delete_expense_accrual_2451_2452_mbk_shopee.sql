-- CM MBK · SHOPEE_FEE #2451/#2452 강제 삭제 (status=done, 미연결 오표시)
-- 미리보기에서 확인됨: SHOPEE_FEE::wm::correction / 2026-07-31

-- A) 연결·실지급 확인 (0행이어야 안전)
SELECT id, expense_accrual_id, ref_type, amount, bank_transaction_id, petty_cash_transaction_id
FROM public.payable_transactions
WHERE expense_accrual_id IN (2451, 2452)
  AND (
    COALESCE(bank_transaction_id, 0) > 0
    OR COALESCE(petty_cash_transaction_id, 0) > 0
    OR amount < 0
  );

-- B) A가 0행이면 아래 통째로 실행
BEGIN;

DELETE FROM public.payable_transactions
WHERE expense_accrual_id IN (2451, 2452);

DELETE FROM public.journal_lines
WHERE journal_entry_id IN (
  SELECT id FROM public.journal_entries
  WHERE source_type = 'expense_accrual' AND source_id IN (2451, 2452)
);

DELETE FROM public.journal_entries
WHERE source_type = 'expense_accrual' AND source_id IN (2451, 2452);

DELETE FROM public.vat_ledger_entries
WHERE memo ILIKE '%[AUTO:EXPENSE_ACCRUAL:2451]%'
   OR memo ILIKE '%[AUTO:EXPENSE_ACCRUAL:2452]%';

DELETE FROM public.expense_accruals
WHERE id IN (2451, 2452);

COMMIT;

-- C) 검증: [] / 0행
SELECT id, status, amount FROM public.expense_accruals WHERE id IN (2451, 2452);
