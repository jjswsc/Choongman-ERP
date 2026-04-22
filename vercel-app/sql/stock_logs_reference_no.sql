-- 강제 출고 등 stock_logs 행에 세금계산서·내부 참조번호 저장
-- 외부/신규 환경에서 stock_logs가 아직 없으면 오류 없이 안내만 남기고 종료
DO $$
BEGIN
  IF to_regclass('public.stock_logs') IS NULL THEN
    RAISE NOTICE 'public.stock_logs table does not exist. Run base schema migration first.';
    RETURN;
  END IF;

  ALTER TABLE public.stock_logs
    ADD COLUMN IF NOT EXISTS reference_no TEXT NULL;

  COMMENT ON COLUMN public.stock_logs.reference_no IS
    'Tax invoice / internal reference (e.g. 강제출고 시 일괄 입력)';
END
$$;
