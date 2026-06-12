-- 회원앱 픽업 선결제(포인트+QR) — 오피스 파일럿 ON
-- Supabase SQL Editor에서 1회 실행. Vercel MEMBER_PORTAL_PREPAY_ENABLED=1 과 동일 효과.
--
-- store_codes 비우면 본사·오피스 계열 매장(이름/코드에 office·본사 등)만 선결제 대상.
-- 특정 코드만: value_json 을 '["Office"]'::jsonb 형태로 설정.
-- 전 매장: member_portal_prepay_all_public_stores = true (관리자 CRM 회원앱 탭에서도 설정 가능).

INSERT INTO public.system_settings (key, value_json, updated_at)
VALUES
  ('member_portal_prepay_enabled', 'true'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok')),
  ('member_portal_prepay_store_codes', '[]'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok')),
  ('member_portal_prepay_all_public_stores', 'false'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok'))
ON CONFLICT (key) DO UPDATE SET
  value_json = EXCLUDED.value_json,
  updated_at = EXCLUDED.updated_at;

-- 픽업 리드·LINE 알림 기본값 (관리자 CRM → 회원앱 → 배달 탭에서도 변경 가능)
INSERT INTO public.system_settings (key, value_json, updated_at)
VALUES
  ('member_portal_pickup_min_lead_minutes', '30'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok')),
  ('member_portal_pickup_min_lead_by_store', '{}'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok')),
  ('member_portal_pickup_line_notify_enabled', 'true'::jsonb, (NOW() AT TIME ZONE 'Asia/Bangkok'))
ON CONFLICT (key) DO NOTHING;
