-- 제출 전 AUTO 매입 VAT 초안 미리보기 (삭제 없음)
-- 대상: draft + memo [AUTO:EXPENSE_ACCRUAL|BANK_TX|PETTY_CASH|CARD_TX|STOCK_LOG]
-- submitted 행·매출(output)·POS 주문은 포함하지 않음.
-- 영업 중 POS 자동인쇄와 무관 (vat_ledger_entries 만, pos_orders 미사용).

SELECT
  id,
  tax_month,
  direction,
  store_name,
  invoice_number,
  counterparty_name,
  net_amount,
  vat_amount,
  filing_status,
  left(coalesce(memo, ''), 120) AS memo_preview
FROM public.vat_ledger_entries
WHERE direction = 'input'
  AND lower(coalesce(filing_status, 'draft')) <> 'submitted'
  AND (
    memo ILIKE '%[AUTO:EXPENSE_ACCRUAL:%'
    OR memo ILIKE '%[AUTO:BANK_TX:%'
    OR memo ILIKE '%[AUTO:PETTY_CASH:%'
    OR memo ILIKE '%[AUTO:CARD_TX:%'
    OR memo ILIKE '%[AUTO:STOCK_LOG:%'
  )
ORDER BY tax_month DESC, id DESC
LIMIT 5000;
