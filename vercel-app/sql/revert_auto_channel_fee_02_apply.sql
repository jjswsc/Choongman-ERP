-- 적용 — 이것만 복사 → Run (한 트랜잭션)
-- 영업 중·POS 켠 상태와 무관(pos_orders 미수정). 분개·잔액 대량 변경 → 심야·마감 후 권장.
-- auto_bank_chip / auto_bank_chip_cover / auto_bank_chip_rematch 정산 + 연결 분개 삭제.
-- manual_confirmed / csv_import 유지.
-- 삭제 후 1130에 수수료만큼 잔액이 다시 생길 수 있음(8월형 월별 수기와 동일).

BEGIN;

DO $$
DECLARE
  v_sid bigint;
  r record;
  v_count integer := 0;
BEGIN
  FOR v_sid IN
    SELECT pcs.id
    FROM public.pos_channel_settlements pcs
    WHERE lower(btrim(COALESCE(pcs.fee_source, ''))) IN (
      'auto_bank_chip',
      'auto_bank_chip_cover',
      'auto_bank_chip_rematch'
    )
    ORDER BY pcs.id
  LOOP
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

    DELETE FROM public.pos_channel_settlements
    WHERE id = v_sid;

    v_count := v_count + 1;
  END LOOP;

  RAISE NOTICE 'revert_auto_channel_fee: deleted % auto settlements (+ journals)', v_count;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('revert_auto_channel_fee_02_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;

COMMIT;
