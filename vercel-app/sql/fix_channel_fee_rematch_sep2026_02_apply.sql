-- 2/2 적용 — 이것만 복사 → Run (① 미리보기 확인 후)
-- 우선 5건: 잘못된 소액 입금 링크를 후보 통장으로 재연결 + NET/FEE 재계산.
-- 옛 채널정산 분개(회사·세무) 삭제·원장 차감 후 journal_entry_id NULL.
-- 적용 후 ERP「채널 정산」에서 해당 5건을 다시 저장하면 분개가 새로 붙습니다.
-- pos_orders 미수정. Realtime 영수증 재인쇄와 무관.
-- 재실행 안전: 아직 old_bank_id 로 연결된 행만 갱신.

BEGIN;

CREATE TEMP TABLE _fee_rematch_plan ON COMMIT DROP AS
SELECT *
FROM (
  VALUES
    (236, 13090, 13479),
    (275, 13274, 13261),
    (362, 13637, 13638),
    (293, 13361, 13362),
    (422, 13761, 14030)
) AS t(settlement_id, old_bank_id, new_bank_id);

-- 새 통장이 다른 정산에 이미 묶여 있으면 중단
DO $$
DECLARE
  conflict_id integer;
  conflict_bank integer;
BEGIN
  SELECT o.id, p.new_bank_id
  INTO conflict_id, conflict_bank
  FROM _fee_rematch_plan p
  JOIN public.pos_channel_settlements pcs
    ON pcs.id = p.settlement_id
   AND pcs.bank_transaction_id = p.old_bank_id
  JOIN public.pos_channel_settlements o
    ON o.bank_transaction_id = p.new_bank_id
   AND o.id <> p.settlement_id
  LIMIT 1;
  IF conflict_id IS NOT NULL THEN
    RAISE EXCEPTION
      'new bank #% already linked to settlement #% — abort rematch',
      conflict_bank, conflict_id;
  END IF;
END $$;

-- 분개 원장 차감 (회사장부만; book=tax 는 ledger_balances 미사용)
WITH doomed AS (
  SELECT
    je.id,
    to_char(je.accounting_date, 'YYYY-MM') AS year_month,
    COALESCE(NULLIF(btrim(je.store_name), ''), 'All') AS store_name
  FROM _fee_rematch_plan p
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
USING public.journal_entries je, _fee_rematch_plan p, public.pos_channel_settlements pcs
WHERE jl.journal_entry_id = je.id
  AND je.source_type = 'pos_channel_settlement'
  AND je.source_id = p.settlement_id
  AND pcs.id = p.settlement_id
  AND pcs.bank_transaction_id = p.old_bank_id;

DELETE FROM public.journal_entries je
USING _fee_rematch_plan p, public.pos_channel_settlements pcs
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
FROM _fee_rematch_plan p
JOIN public.bank_transactions bt ON bt.id = p.new_bank_id
WHERE pcs.id = p.settlement_id
  AND pcs.bank_transaction_id = p.old_bank_id
  AND ABS(bt.amount) > 1
  AND pcs.gross_amt + 0.02 >= ABS(bt.amount);

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_channel_fee_rematch_sep2026_02_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;

COMMIT;
