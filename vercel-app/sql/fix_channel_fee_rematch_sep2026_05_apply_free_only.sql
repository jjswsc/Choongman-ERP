-- 통장 충돌 없는 건만 적용 — 이것만 복사 → Run
-- #362 (Future Park card → #13638) 만. 밴드 안(약 4.9%).
-- #293 은 재연결해도 카드 수수료 ~26% 라 여기 넣지 않음(오매칭 가능성).
-- #236/#275/#422 는 후보 통장이 이미 다른 정산에 묶여 있어 03·04 결과 보고 다음 적용.
-- pos_orders 미수정.

BEGIN;

CREATE TEMP TABLE _fee_rematch_free ON COMMIT DROP AS
SELECT *
FROM (VALUES (362, 13637, 13638)) AS t(settlement_id, old_bank_id, new_bank_id);

DO $$
DECLARE
  conflict_id integer;
  conflict_bank integer;
BEGIN
  SELECT o.id, p.new_bank_id
  INTO conflict_id, conflict_bank
  FROM _fee_rematch_free p
  JOIN public.pos_channel_settlements pcs
    ON pcs.id = p.settlement_id
   AND pcs.bank_transaction_id = p.old_bank_id
  JOIN public.pos_channel_settlements o
    ON o.bank_transaction_id = p.new_bank_id
   AND o.id <> p.settlement_id
  LIMIT 1;
  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION
      'new bank #% already linked to settlement #% — abort',
      conflict_bank, conflict_id;
  END IF;
END $$;

WITH doomed AS (
  SELECT
    je.id,
    to_char(je.accounting_date, 'YYYY-MM') AS year_month,
    COALESCE(NULLIF(btrim(je.store_name), ''), 'All') AS store_name
  FROM _fee_rematch_free p
  JOIN public.pos_channel_settlements pcs
    ON pcs.id = p.settlement_id
   AND pcs.bank_transaction_id = p.old_bank_id
  JOIN public.journal_entries je
    ON je.source_type = 'pos_channel_settlement'
   AND je.source_id = p.settlement_id
  WHERE COALESCE(je.book, '') IS DISTINCT FROM 'tax'
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
USING public.journal_entries je, _fee_rematch_free p, public.pos_channel_settlements pcs
WHERE jl.journal_entry_id = je.id
  AND je.source_type = 'pos_channel_settlement'
  AND je.source_id = p.settlement_id
  AND pcs.id = p.settlement_id
  AND pcs.bank_transaction_id = p.old_bank_id;

DELETE FROM public.journal_entries je
USING _fee_rematch_free p, public.pos_channel_settlements pcs
WHERE je.source_type = 'pos_channel_settlement'
  AND je.source_id = p.settlement_id
  AND pcs.id = p.settlement_id
  AND pcs.bank_transaction_id = p.old_bank_id;

UPDATE public.pos_channel_settlements pcs
SET
  bank_transaction_id = p.new_bank_id,
  net_amt = ROUND(ABS(bt.amount)::numeric, 2),
  fee_amt = ROUND((pcs.gross_amt - ABS(bt.amount))::numeric, 2),
  journal_entry_id = NULL,
  fee_source = 'auto_bank_chip_rematch',
  memo = left(
    trim(
      both ' '
      FROM concat_ws(
        ' ',
        nullif(btrim(COALESCE(pcs.memo, '')), ''),
        format('[rematch bank #%s→#%s]', p.old_bank_id, p.new_bank_id)
      )
    ),
    500
  ),
  updated_at = now()
FROM _fee_rematch_free p
JOIN public.bank_transactions bt ON bt.id = p.new_bank_id
WHERE pcs.id = p.settlement_id
  AND pcs.bank_transaction_id = p.old_bank_id
  AND ABS(bt.amount) > 1
  AND pcs.gross_amt + 0.02 >= ABS(bt.amount);

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_channel_fee_rematch_sep2026_05_apply_free_only.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;

COMMIT;
