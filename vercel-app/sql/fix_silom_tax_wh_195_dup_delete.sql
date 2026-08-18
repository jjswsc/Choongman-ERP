-- 5/6 삭제: CM Silom 원천세 ฿195 (2026-08-17) planned·미연결 중복
-- ⚠️ 1~4 미리보기 후, 3/6 연결 행이 0건일 때만 실행
-- 배포 후 Fang이 1건만 다시 등록·연결하도록 전부 삭제 (유지 행 없음)

BEGIN;

WITH dup AS (
  SELECT ea.id
  FROM public.expense_accruals ea
  WHERE ea.store_name ILIKE '%Silom%'
    AND ea.expense_date = DATE '2026-08-17'
    AND abs(ea.amount::numeric - 195) < 0.02
    AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
    AND lower(coalesce(ea.status, '')) = 'planned'
    AND NOT EXISTS (
      SELECT 1
      FROM public.payable_transactions pt
      WHERE pt.expense_accrual_id = ea.id
        AND (
          coalesce(pt.bank_transaction_id, 0) > 0
          OR coalesce(pt.petty_cash_transaction_id, 0) > 0
          OR pt.amount < 0
        )
    )
)
DELETE FROM public.payable_transactions
WHERE expense_accrual_id IN (SELECT id FROM dup);

WITH dup AS (
  SELECT ea.id
  FROM public.expense_accruals ea
  WHERE ea.store_name ILIKE '%Silom%'
    AND ea.expense_date = DATE '2026-08-17'
    AND abs(ea.amount::numeric - 195) < 0.02
    AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
    AND lower(coalesce(ea.status, '')) = 'planned'
    AND NOT EXISTS (
      SELECT 1
      FROM public.payable_transactions pt
      WHERE pt.expense_accrual_id = ea.id
        AND (
          coalesce(pt.bank_transaction_id, 0) > 0
          OR coalesce(pt.petty_cash_transaction_id, 0) > 0
          OR pt.amount < 0
        )
    )
)
DELETE FROM public.journal_lines
WHERE journal_entry_id IN (
  SELECT je.id
  FROM public.journal_entries je
  WHERE je.source_type = 'expense_accrual'
    AND je.source_id IN (SELECT id FROM dup)
);

WITH dup AS (
  SELECT ea.id
  FROM public.expense_accruals ea
  WHERE ea.store_name ILIKE '%Silom%'
    AND ea.expense_date = DATE '2026-08-17'
    AND abs(ea.amount::numeric - 195) < 0.02
    AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
    AND lower(coalesce(ea.status, '')) = 'planned'
    AND NOT EXISTS (
      SELECT 1
      FROM public.payable_transactions pt
      WHERE pt.expense_accrual_id = ea.id
        AND (
          coalesce(pt.bank_transaction_id, 0) > 0
          OR coalesce(pt.petty_cash_transaction_id, 0) > 0
          OR pt.amount < 0
        )
    )
)
DELETE FROM public.journal_entries
WHERE source_type = 'expense_accrual'
  AND source_id IN (SELECT id FROM dup);

WITH dup AS (
  SELECT ea.id
  FROM public.expense_accruals ea
  WHERE ea.store_name ILIKE '%Silom%'
    AND ea.expense_date = DATE '2026-08-17'
    AND abs(ea.amount::numeric - 195) < 0.02
    AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
    AND lower(coalesce(ea.status, '')) = 'planned'
)
DELETE FROM public.vat_ledger_entries v
WHERE EXISTS (
  SELECT 1 FROM dup d
  WHERE coalesce(v.memo, '') ILIKE '%[AUTO:EXPENSE_ACCRUAL:' || d.id::text || ']%'
);

WITH dup AS (
  SELECT ea.id
  FROM public.expense_accruals ea
  WHERE ea.store_name ILIKE '%Silom%'
    AND ea.expense_date = DATE '2026-08-17'
    AND abs(ea.amount::numeric - 195) < 0.02
    AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
    AND lower(coalesce(ea.status, '')) = 'planned'
)
DELETE FROM public.withholding_tax_ledger_entries w
WHERE EXISTS (
  SELECT 1 FROM dup d
  WHERE coalesce(w.memo, '') ILIKE '%[AUTO:EXPENSE_ACCRUAL_WHT:' || d.id::text || ']%'
);

DELETE FROM public.expense_accruals ea
WHERE ea.store_name ILIKE '%Silom%'
  AND ea.expense_date = DATE '2026-08-17'
  AND abs(ea.amount::numeric - 195) < 0.02
  AND coalesce(ea.payee_code, '') ILIKE '%tax_withholding%'
  AND lower(coalesce(ea.status, '')) = 'planned'
  AND NOT EXISTS (
    SELECT 1
    FROM public.payable_transactions pt
    WHERE pt.expense_accrual_id = ea.id
      AND (
        coalesce(pt.bank_transaction_id, 0) > 0
        OR coalesce(pt.petty_cash_transaction_id, 0) > 0
        OR pt.amount < 0
      )
  );

COMMIT;
