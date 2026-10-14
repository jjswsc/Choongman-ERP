-- S&J 청구(IV) 세무 미러 복구. 먼저 archive/diagnose/diagnose_tax_outbound_iv_mirror_01_summary.sql로 건수 확인.
-- 1) 수금(RV) 세무 전표 entry_no를 IV… → IV…#RV<미수id> 로 바꿔 청구(SV)가 IV 번호를 쓰게 한다.
-- 2) 회사 전표는 있는데 세무 전표가 없는 청구·수금을 같은 분개선으로 세무 장부에 복사한다.
-- 세무 기간이 마감된 달은 건너뛴다. 다시 실행해도 이미 있는 세무 전표는 만들지 않는다.
-- pos_orders는 건드리지 않는다(Realtime·자동인쇄 영향 없음). 블록 전체를 한 번에 Run.

DO $$
DECLARE
  renamed_count integer;
  inserted_count integer;
  skipped_conflict integer;
BEGIN
  UPDATE public.journal_entries
  SET entry_no = entry_no || '#RV' || source_id::text
  WHERE book = 'tax'
    AND source_type = 'outbound_collection'
    AND source_id IS NOT NULL
    AND entry_no ~ '^IVF?[0-9]{8}-[0-9]+$';
  GET DIAGNOSTICS renamed_count = ROW_COUNT;
  RAISE NOTICE 'renamed collection tax entries: %', renamed_count;

  CREATE TEMP TABLE tax_iv_mirror_todo ON COMMIT DROP AS
  SELECT DISTINCT ON (je.source_type, je.source_id)
    je.id AS company_entry_id,
    je.accounting_date,
    je.source_type,
    je.source_id,
    je.store_name,
    je.memo,
    je.posted_by,
    CASE WHEN je.source_type = 'outbound_collection' THEN 'receipt' ELSE 'sales' END AS voucher_kind,
    CASE
      WHEN inv.no IS NULL THEN 'JE-TAX-MIRROR-' || je.id::text
      WHEN je.source_type = 'outbound_collection' THEN inv.no || '#RV' || je.source_id::text
      ELSE inv.no
    END AS target_entry_no
  FROM public.journal_entries je
  CROSS JOIN LATERAL (
    SELECT substring(je.memo from '(IVF?[0-9]{8}-[0-9]+)') AS no
  ) inv
  LEFT JOIN public.tax_accounting_periods p
    ON p.tax_entity_code = 'tin:0105566137147'
   AND p.year_month = to_char(je.accounting_date::date, 'YYYY-MM')
  WHERE COALESCE(je.book, '') <> 'tax'
    AND je.source_type IN ('outbound_bill', 'outbound_bill_force', 'outbound_collection')
    AND je.source_id IS NOT NULL
    AND je.store_name IN ('CM Office', 'CM Office HQ')
    AND COALESCE(p.is_closed, false) = false
    AND NOT EXISTS (
      SELECT 1 FROM public.journal_entries t
      WHERE t.book = 'tax'
        AND t.source_type = je.source_type
        AND t.source_id = je.source_id
        AND t.tax_entity_code = 'tin:0105566137147'
    )
    AND (SELECT count(*) FROM public.journal_lines l WHERE l.journal_entry_id = je.id) >= 2
  ORDER BY je.source_type, je.source_id, je.id DESC;

  SELECT count(*) INTO skipped_conflict
  FROM tax_iv_mirror_todo m
  WHERE EXISTS (SELECT 1 FROM public.journal_entries x WHERE x.entry_no = m.target_entry_no);
  RAISE NOTICE 'skipped (entry_no already taken): %', skipped_conflict;

  DELETE FROM tax_iv_mirror_todo m
  WHERE EXISTS (SELECT 1 FROM public.journal_entries x WHERE x.entry_no = m.target_entry_no);

  WITH inserted AS (
    INSERT INTO public.journal_entries (
      entry_no,
      accounting_date,
      source_type,
      source_id,
      store_name,
      memo,
      posted_by,
      book,
      voucher_kind,
      tax_entity_code
    )
    SELECT
      m.target_entry_no,
      m.accounting_date,
      m.source_type,
      m.source_id,
      m.store_name,
      m.memo,
      m.posted_by,
      'tax',
      m.voucher_kind,
      'tin:0105566137147'
    FROM tax_iv_mirror_todo m
    RETURNING id, entry_no
  )
  INSERT INTO public.journal_lines (
    journal_entry_id,
    line_no,
    account_code,
    account_name,
    side,
    amount,
    memo,
    account_subject_id
  )
  SELECT
    i.id,
    l.line_no,
    l.account_code,
    l.account_name,
    l.side,
    l.amount,
    l.memo,
    l.account_subject_id
  FROM inserted i
  JOIN tax_iv_mirror_todo m ON m.target_entry_no = i.entry_no
  JOIN public.journal_lines l ON l.journal_entry_id = m.company_entry_id;

  SELECT count(*) INTO inserted_count FROM tax_iv_mirror_todo;
  RAISE NOTICE 'inserted tax mirror entries: %', inserted_count;
END $$;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_tax_outbound_iv_mirror_02_apply.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
