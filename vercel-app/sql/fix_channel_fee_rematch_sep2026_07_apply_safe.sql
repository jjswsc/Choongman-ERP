-- 안전 적용 — 이것만 복사 → Run (TEMP 테이블 없음, 한 트랜잭션)
-- A) #362 Future Park card → 통장 #13638 (같은 매장, 수수료 ~4.9%, 밴드 안)
-- B) #236/#275/#293/#422 : 잘못된 소액 링크만 해제(분개 삭제). 통장 뺏지 않음.
--    (#13479→Seacon #485, #13261→FP #271, #14030→Huamak #610 은 유지)
-- pos_orders 미수정. 재실행 안전(아직 old_bank 인 행만).

BEGIN;

-- ── A) #362 재연결 ─────────────────────────────────────────
DO $$
DECLARE
  v_sid integer := 362;
  v_old integer := 13637;
  v_new integer := 13638;
  v_gross numeric;
  v_net numeric;
  v_fee numeric;
  r record;
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.pos_channel_settlements o
    WHERE o.bank_transaction_id = v_new AND o.id <> v_sid
  ) THEN
    RAISE EXCEPTION 'bank #% already linked — abort #362', v_new;
  END IF;

  SELECT pcs.gross_amt, ROUND(ABS(bt.amount)::numeric, 2)
  INTO v_gross, v_net
  FROM public.pos_channel_settlements pcs
  JOIN public.bank_transactions bt ON bt.id = v_new
  WHERE pcs.id = v_sid
    AND pcs.bank_transaction_id = v_old
    AND pcs.gross_amt + 0.02 >= ABS(bt.amount);

  IF v_gross IS NULL THEN
    RAISE NOTICE '#362 skip (already rematched or missing)';
    RETURN;
  END IF;

  v_fee := ROUND(v_gross - v_net, 2);

  FOR r IN
    SELECT
      je.id,
      to_char(je.accounting_date, 'YYYY-MM') AS year_month,
      COALESCE(NULLIF(btrim(je.store_name), ''), 'All') AS store_name
    FROM public.journal_entries je
    WHERE je.source_type = 'pos_channel_settlement'
      AND je.source_id = v_sid
      AND COALESCE(je.book, '') IS DISTINCT FROM 'tax'
  LOOP
    UPDATE public.ledger_balances lb
    SET
      debit_total = lb.debit_total - x.debit_total,
      credit_total = lb.credit_total - x.credit_total,
      balance = (lb.debit_total - x.debit_total) - (lb.credit_total - x.credit_total),
      updated_at = now()
    FROM (
      SELECT
        jl.account_code,
        sum(CASE WHEN jl.side = 'debit' THEN jl.amount ELSE 0 END) AS debit_total,
        sum(CASE WHEN jl.side = 'credit' THEN jl.amount ELSE 0 END) AS credit_total
      FROM public.journal_lines jl
      WHERE jl.journal_entry_id = r.id
      GROUP BY jl.account_code
    ) x
    WHERE lb.year_month = r.year_month
      AND lb.store_name = r.store_name
      AND lb.account_code = x.account_code;
  END LOOP;

  DELETE FROM public.journal_lines jl
  USING public.journal_entries je
  WHERE jl.journal_entry_id = je.id
    AND je.source_type = 'pos_channel_settlement'
    AND je.source_id = v_sid;

  DELETE FROM public.journal_entries
  WHERE source_type = 'pos_channel_settlement'
    AND source_id = v_sid;

  UPDATE public.pos_channel_settlements
  SET
    bank_transaction_id = v_new,
    net_amt = v_net,
    fee_amt = v_fee,
    journal_entry_id = NULL,
    fee_source = 'auto_bank_chip_rematch',
    memo = left(
      trim(both ' ' FROM concat_ws(
        ' ',
        nullif(btrim(COALESCE(memo, '')), ''),
        format('[rematch bank #%s→#%s]', v_old, v_new)
      )),
      500
    ),
    updated_at = now()
  WHERE id = v_sid
    AND bank_transaction_id = v_old;

  RAISE NOTICE '#362 rematched net=% fee=%', v_net, v_fee;
END $$;

-- ── B) 오링크 해제 (#236,#275,#293,#422) ───────────────────
DO $$
DECLARE
  v_sid integer;
  r record;
BEGIN
  FOREACH v_sid IN ARRAY ARRAY[236, 275, 293, 422]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.pos_channel_settlements pcs
      WHERE pcs.id = v_sid
        AND pcs.bank_transaction_id IS NOT NULL
        AND (
          (pcs.id = 236 AND pcs.bank_transaction_id = 13090) OR
          (pcs.id = 275 AND pcs.bank_transaction_id = 13274) OR
          (pcs.id = 293 AND pcs.bank_transaction_id = 13361) OR
          (pcs.id = 422 AND pcs.bank_transaction_id = 13761)
        )
    ) THEN
      RAISE NOTICE '#% skip unlink (already fixed)', v_sid;
      CONTINUE;
    END IF;

    FOR r IN
      SELECT
        je.id,
        to_char(je.accounting_date, 'YYYY-MM') AS year_month,
        COALESCE(NULLIF(btrim(je.store_name), ''), 'All') AS store_name
      FROM public.journal_entries je
      WHERE je.source_type = 'pos_channel_settlement'
        AND je.source_id = v_sid
        AND COALESCE(je.book, '') IS DISTINCT FROM 'tax'
    LOOP
      UPDATE public.ledger_balances lb
      SET
        debit_total = lb.debit_total - x.debit_total,
        credit_total = lb.credit_total - x.credit_total,
        balance = (lb.debit_total - x.debit_total) - (lb.credit_total - x.credit_total),
        updated_at = now()
      FROM (
        SELECT
          jl.account_code,
          sum(CASE WHEN jl.side = 'debit' THEN jl.amount ELSE 0 END) AS debit_total,
          sum(CASE WHEN jl.side = 'credit' THEN jl.amount ELSE 0 END) AS credit_total
        FROM public.journal_lines jl
        WHERE jl.journal_entry_id = r.id
        GROUP BY jl.account_code
      ) x
      WHERE lb.year_month = r.year_month
        AND lb.store_name = r.store_name
        AND lb.account_code = x.account_code;
    END LOOP;

    DELETE FROM public.journal_lines jl
    USING public.journal_entries je
    WHERE jl.journal_entry_id = je.id
      AND je.source_type = 'pos_channel_settlement'
      AND je.source_id = v_sid;

    DELETE FROM public.journal_entries
    WHERE source_type = 'pos_channel_settlement'
      AND source_id = v_sid;

    UPDATE public.pos_channel_settlements
    SET
      bank_transaction_id = NULL,
      journal_entry_id = NULL,
      fee_source = 'unlinked_implausible',
      memo = left(
        trim(both ' ' FROM concat_ws(
          ' ',
          nullif(btrim(COALESCE(memo, '')), ''),
          '[unlinked tiny/wrong bank — needs correct Grab/card deposit]'
        )),
        500
      ),
      updated_at = now()
    WHERE id = v_sid;

    RAISE NOTICE '#% unlinked', v_sid;
  END LOOP;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_channel_fee_rematch_sep2026_07_apply_safe.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;

COMMIT;
