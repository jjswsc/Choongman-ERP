-- 5/6 삭제: CM MBK 마크로 ฿1,031.43 중복 EXP2026070039 (#2316) + 통장 #10403
-- ⚠️ 1~4 미리보기 확인됨.
-- 유지: EXP2026070037 (#2313, done) + 통장 #10368
-- 삭제: EXP2026070039 (#2316, paid) + 통장 #10403 (BBL Ref X2665 — 같은 금액 두 번째 연결)
-- 7월 마감 행 없음(is_closed null). 다른 마크로(฿159 / ฿1,798.57)는 건드리지 않음.

BEGIN;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.expense_accruals
    WHERE id = 2316
      AND document_no = 'EXP2026070039'
      AND abs(amount::numeric - 1031.43) < 0.02
      AND store_name ILIKE '%MBK%'
  ) THEN
    RAISE EXCEPTION 'Guard failed: EXP2026070039 / #2316 mismatch';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.bank_transactions
    WHERE id = 10403
      AND abs(amount::numeric) BETWEEN 1031.40 AND 1031.46
      AND trans_type = 'withdraw'
  ) THEN
    RAISE EXCEPTION 'Guard failed: bank #10403 mismatch';
  END IF;
END $$;

DELETE FROM public.payable_transactions
WHERE expense_accrual_id = 2316
   OR bank_transaction_id = 10403;

DELETE FROM public.journal_lines
WHERE journal_entry_id IN (
  SELECT id
  FROM public.journal_entries
  WHERE (source_type = 'expense_accrual' AND source_id = 2316)
     OR (source_type = 'bank_transaction' AND source_id = 10403)
);

DELETE FROM public.journal_entries
WHERE (source_type = 'expense_accrual' AND source_id = 2316)
   OR (source_type = 'bank_transaction' AND source_id = 10403);

DELETE FROM public.vat_ledger_entries
WHERE memo ILIKE '%[AUTO:EXPENSE_ACCRUAL:2316]%'
  AND lower(coalesce(filing_status, '')) <> 'submitted';

DELETE FROM public.withholding_tax_ledger_entries
WHERE memo ILIKE '%[AUTO:EXPENSE_ACCRUAL_WHT:2316]%'
  AND lower(coalesce(filing_status, '')) <> 'submitted';

DELETE FROM public.expense_accruals
WHERE id = 2316
  AND document_no = 'EXP2026070039';

DELETE FROM public.bank_transactions
WHERE id = 10403
  AND abs(amount::numeric) BETWEEN 1031.40 AND 1031.46;

COMMIT;
