-- 영업 중 pos_orders UPDATE 없음. journal_entries.voucher_kind만 수정.
-- 회계 표준: JV 조정 / SV 매출 / PV 비용·매입 / RV 매출수금 / PP 그 외 출금

BEGIN;

UPDATE public.journal_entries
SET voucher_kind = 'receipt'
WHERE source_type IN ('pos_channel_settlement', 'pos_deposit_receive')
  AND coalesce(voucher_kind, '') <> 'receipt'
  AND accounting_date >= '2026-07-01';

UPDATE public.journal_entries
SET voucher_kind = 'purchase'
WHERE source_type IN ('expense_accrual', 'store_purchase', 'tax_purchase_summary', 'tax_inventory_cogs')
  AND coalesce(voucher_kind, '') <> 'purchase'
  AND accounting_date >= '2026-07-01';

UPDATE public.journal_entries
SET voucher_kind = 'purchase'
WHERE source_type = 'petty_cash'
  AND coalesce(memo, '') NOT LIKE '%보충%'
  AND coalesce(memo, '') NOT ILIKE '%replenish%'
  AND coalesce(voucher_kind, '') <> 'purchase'
  AND accounting_date >= '2026-07-01';

UPDATE public.journal_entries
SET voucher_kind = 'sales'
WHERE source_type IN ('pos_order', 'pos_order_reversal', 'pos_day_close', 'tax_sales_summary')
  AND coalesce(voucher_kind, '') <> 'sales'
  AND accounting_date >= '2026-07-01';

UPDATE public.journal_entries
SET voucher_kind = 'general'
WHERE source_type IN ('tax_adjustment', 'tax_manual', 'depreciation', 'tax_opening', 'tax_payroll', 'tax_vat_summary')
  AND coalesce(voucher_kind, '') <> 'general'
  AND accounting_date >= '2026-07-01';

COMMIT;
