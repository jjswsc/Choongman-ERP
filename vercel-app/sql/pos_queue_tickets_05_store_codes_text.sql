-- 자리 대기 번호표 — 배포 전 즉시 복구용 (system_settings 1키, pos_orders 미변경 · 영업 중 실행 가능)
-- 기존 서버 코드는 jsonb 배열 값을 읽지 못해 버튼이 숨겨졌다 → 같은 매장 목록을 쉼표 텍스트(jsonb 문자열)로 저장
-- 여러 매장: 'CM Union Mall, CM Silom' 처럼 쉼표로 구분
UPDATE public.system_settings
SET value_json = to_jsonb('CM Union Mall'::text),
    updated_at = (NOW() AT TIME ZONE 'Asia/Bangkok')
WHERE key = 'pos_queue_store_codes';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_queue_tickets_05_store_codes_text.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
