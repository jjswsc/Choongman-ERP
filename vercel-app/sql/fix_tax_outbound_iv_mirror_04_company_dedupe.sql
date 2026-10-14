-- 회사 장부 청구(วางบิล) 전표 중복 정리 + 재발 방지 인덱스.
-- 출고 화면·인쇄 화면이 동시에 호출해 같은 IV에 회사 청구 전표가 2개 생긴 것을, 가장 먼저 만든 1개만 남기고 지운다.
-- 세무 장부(book=tax)는 건드리지 않는다. pos_orders 무관(Realtime·자동인쇄 영향 없음).
-- 먼저 archive/diagnose/diagnose_tax_outbound_iv_mirror_03_company_duplicates.sql로 건수 확인. 블록 전체를 한 번에 Run.

DO $$
DECLARE
  removed_count integer;
BEGIN
  CREATE TEMP TABLE outbound_bill_dup_ids ON COMMIT DROP AS
  SELECT je.id
  FROM public.journal_entries je
  WHERE COALESCE(je.book, '') <> 'tax'
    AND je.source_type IN ('outbound_bill', 'outbound_bill_force')
    AND je.source_id IS NOT NULL
    AND je.id > (
      SELECT min(k.id)
      FROM public.journal_entries k
      WHERE COALESCE(k.book, '') <> 'tax'
        AND k.source_type = je.source_type
        AND k.source_id = je.source_id
    );

  DELETE FROM public.journal_lines
  WHERE journal_entry_id IN (SELECT id FROM outbound_bill_dup_ids);

  DELETE FROM public.journal_entries
  WHERE id IN (SELECT id FROM outbound_bill_dup_ids);
  GET DIAGNOSTICS removed_count = ROW_COUNT;
  RAISE NOTICE 'removed duplicate company bill entries: %', removed_count;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_company_outbound_bill_uq
  ON public.journal_entries (source_type, source_id)
  WHERE COALESCE(book, '') <> 'tax'
    AND source_type IN ('outbound_bill', 'outbound_bill_force');

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_tax_outbound_iv_mirror_04_company_dedupe.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
