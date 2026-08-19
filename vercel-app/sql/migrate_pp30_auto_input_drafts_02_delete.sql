-- 제출 전 AUTO 매입 VAT 초안 삭제
-- 반드시 01_preview 건수를 확인한 뒤 실행.
-- submitted 행은 삭제하지 않음. pos_orders 는 건드리지 않음.
-- 영업 중 POS 자동인쇄와 무관 (vat_ledger_entries 만).

BEGIN;

DELETE FROM public.vat_ledger_entries
WHERE direction = 'input'
  AND lower(coalesce(filing_status, 'draft')) <> 'submitted'
  AND (
    memo ILIKE '%[AUTO:EXPENSE_ACCRUAL:%'
    OR memo ILIKE '%[AUTO:BANK_TX:%'
    OR memo ILIKE '%[AUTO:PETTY_CASH:%'
    OR memo ILIKE '%[AUTO:CARD_TX:%'
    OR memo ILIKE '%[AUTO:STOCK_LOG:%'
  );

COMMIT;
