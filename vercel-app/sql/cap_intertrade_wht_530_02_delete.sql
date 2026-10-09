-- C.A.P. Intertrade (1021) 2026-03-20 원천세 -530.05 만 삭제.
-- 입고 36,750 과 지급 18,375 두 건은 건드리지 않는다.
-- 통장 원천세·원장·분개도 같이 지워서 저장 시 다시 생기지 않게 한다.
-- 이 블록 전체를 한 번에 Run.

DO $$
DECLARE
  rec record;
  removed_count integer := 0;
BEGIN
  FOR rec IN
    SELECT pt.id AS payable_id, pt.bank_transaction_id
    FROM public.payable_transactions pt
    WHERE pt.vendor_code = '1021'
      AND pt.ref_type = 'Withholding'
      AND pt.trans_date = '2026-03-20'
      AND pt.amount = -530.05
  LOOP
    removed_count := removed_count + 1;

    UPDATE public.bank_transactions
    SET
      withholding_tax_amount = NULL,
      withholding_tax_rate = NULL
    WHERE id = rec.bank_transaction_id
      AND COALESCE(withholding_tax_amount, 0) = 530.05;

    DELETE FROM public.withholding_tax_ledger_entries
    WHERE source_type = 'bank_transaction'
      AND source_id = rec.bank_transaction_id
      AND COALESCE(direction, 'outbound') = 'outbound'
      AND wht_amount = 530.05;

    WITH doomed AS (
      SELECT
        je.id,
        to_char(je.accounting_date, 'YYYY-MM') AS year_month,
        COALESCE(NULLIF(btrim(je.store_name), ''), 'All') AS store_name
      FROM public.journal_entries je
      WHERE je.source_type = 'bank_purchase_wht'
        AND je.source_id = rec.bank_transaction_id
    ),
    agg AS (
      SELECT
        d.year_month,
        d.store_name,
        jl.account_code,
        sum(CASE WHEN jl.side = 'debit' THEN jl.amount ELSE 0 END) AS debit_total,
        sum(CASE WHEN jl.side = 'credit' THEN jl.amount ELSE 0 END) AS credit_total
      FROM doomed d
      JOIN public.journal_lines jl ON jl.journal_entry_id = d.id
      GROUP BY d.year_month, d.store_name, jl.account_code
    )
    UPDATE public.ledger_balances lb
    SET
      debit_total = lb.debit_total - agg.debit_total,
      credit_total = lb.credit_total - agg.credit_total,
      balance = (lb.debit_total - agg.debit_total) - (lb.credit_total - agg.credit_total),
      updated_at = now()
    FROM agg
    WHERE lb.year_month = agg.year_month
      AND lb.store_name = agg.store_name
      AND lb.account_code = agg.account_code;

    DELETE FROM public.journal_lines jl
    USING public.journal_entries je
    WHERE jl.journal_entry_id = je.id
      AND je.source_type = 'bank_purchase_wht'
      AND je.source_id = rec.bank_transaction_id;

    DELETE FROM public.journal_entries
    WHERE source_type = 'bank_purchase_wht'
      AND source_id = rec.bank_transaction_id;

    DELETE FROM public.payable_transactions
    WHERE id = rec.payable_id
      AND ref_type = 'Withholding'
      AND amount = -530.05;
  END LOOP;

  RAISE NOTICE 'removed cap intertrade wht rows: %', removed_count;
END $$;
