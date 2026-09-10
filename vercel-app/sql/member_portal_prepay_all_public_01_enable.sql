-- 회원앱 픽업 선결제: 공개 매장 전체에 PromptPay QR 적용
-- 오피스만 대상이던 파일럿(store_codes 빈 목록)을 회원앱 실제 주문 매장으로 확장합니다.
-- 실행 후 회원앱에서 픽업 주문 → 결제 화면에 QR이 나와야 합니다.

BEGIN;

INSERT INTO public.system_settings (key, value_json, updated_at)
VALUES
  ('member_portal_prepay_enabled', 'true'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok')),
  ('member_portal_prepay_all_public_stores', 'true'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok'))
ON CONFLICT (key) DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at;

UPDATE public.system_settings
SET
  value_json = 'true'::jsonb,
  updated_at = (NOW() AT TIME ZONE 'Asia/Bangkok')
WHERE key LIKE 'member_portal_prepay_enabled:%'
   OR key LIKE 'member_portal_prepay_all_public_stores:%';

COMMIT;
