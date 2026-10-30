-- 2/2 적용 — CW Tower 협업 POS 할인율 설정 (기본 10%, True Digital 직원할인과 동일)
-- 실행 전 1/2 조회로 pos_discount_value=0 인지 확인.
-- 할인율이 다르면 아래 10 을 원하는 숫자로 바꾼 뒤 Run.
-- 영업 중에도 안전: marketing_campaigns만 수정 (pos_orders Realtime 무관).
-- 적용 후 확인은 1/2 조회로 다시 Run.

UPDATE marketing_campaigns
SET
  collab_detail = jsonb_set(
    jsonb_set(
      COALESCE(collab_detail, '{}'::jsonb),
      '{posDiscountType}',
      '"percent"'::jsonb,
      true
    ),
    '{posDiscountValue}',
    '10'::jsonb,
    true
  )
WHERE id = 68
  AND topic ILIKE '%CW%'
  AND COALESCE((collab_detail ->> 'posDiscountValue')::numeric, 0) <= 0;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('cw_collab_the_street_02_set_pos_percent.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
