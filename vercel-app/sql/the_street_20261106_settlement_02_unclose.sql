-- 2/2 적용 — CM The street 2026-11-06 결산 마감 해제 (재저장 가능)
-- 개점/마감을 바꿔 눌러 조기 closed=true 된 건. cash_actual(5,000)은 유지 → 매장에서 권종 다시 저장 후 마감.
-- 영업 중 POS가 떠 있어도 이 UPDATE는 Realtime 영수증 재인쇄를 유발하지 않음(pos_settlements).

UPDATE public.pos_settlements
SET
  closed = false,
  updated_at = now()
WHERE store_code = 'CM The street'
  AND settle_date = '2026-11-06'
  AND closed IS TRUE;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('the_street_20261106_settlement_02_unclose.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
