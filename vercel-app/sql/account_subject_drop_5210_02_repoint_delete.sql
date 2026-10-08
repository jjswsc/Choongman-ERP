-- 5210을 5111로 옮긴 뒤 5210 계정을 삭제한다.
-- 미리보기(01) 확인 후 한 번에 실행.
BEGIN;

DO $$
DECLARE
  src_id bigint;
  dst_id bigint;
  dst_name text;
  dst_parent bigint;
  r record;
BEGIN
  SELECT id INTO src_id FROM public.account_subjects WHERE code = '5210' LIMIT 1;
  SELECT id, name, parent_id INTO dst_id, dst_name, dst_parent
  FROM public.account_subjects WHERE code = '5111' LIMIT 1;

  IF src_id IS NULL THEN
    RAISE NOTICE '5210 not found — nothing to delete';
    RETURN;
  END IF;
  IF dst_id IS NULL THEN
    RAISE EXCEPTION '5111 not found — stop';
  END IF;

  UPDATE public.account_subjects
  SET parent_id = dst_parent
  WHERE parent_id = src_id;

  FOR r IN
    SELECT c.table_name
    FROM information_schema.columns c
    JOIN information_schema.tables t
      ON t.table_schema = c.table_schema AND t.table_name = c.table_name
    WHERE c.table_schema = 'public'
      AND c.column_name = 'account_subject_id'
      AND t.table_type = 'BASE TABLE'
      AND c.table_name <> 'account_subjects'
  LOOP
    EXECUTE format(
      'UPDATE public.%I SET account_subject_id = $1 WHERE account_subject_id = $2',
      r.table_name
    )
    USING dst_id, src_id;
  END LOOP;

  UPDATE public.journal_lines
  SET account_code = '5111',
      account_name = COALESCE(dst_name, account_name),
      account_subject_id = dst_id
  WHERE account_code = '5210';

  DELETE FROM public.account_subjects WHERE id = src_id;
END $$;

COMMIT;
