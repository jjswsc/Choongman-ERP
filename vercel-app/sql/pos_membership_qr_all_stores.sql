-- 전 매장 손님 영수증 멤버십 QR 일괄 적용
-- 실행: Supabase SQL Editor
-- 기본 링크: 회원 포털 가입/로그인 (상대 경로 /m — 인쇄 시 매장 배포 도메인으로 해석)
-- 이미지(배포 후 상대 경로): /pos/membership-points-manual-qr.png
-- 앱에서도 동일 값: lib/pos-membership-qr-defaults.ts + POST /api/pos-printer-settings/apply-membership-qr-all
--
-- 주의: 링크 URL이 있으면 업로드 이미지보다 우선합니다.
-- DB에 point.o2o.co.th 가 남아 있으면 새 이미지를 올려도 옛 QR이 인쇄됩니다.

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_image_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_link_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_show_membership_qr BOOLEAN DEFAULT false;

UPDATE public.pos_printer_settings
SET
  receipt_membership_qr_link_url = '/m',
  receipt_membership_qr_image_url = '/pos/membership-points-manual-qr.png',
  receipt_membership_qr_text = 'เช็คสิทธิพิเศษที่นี่',
  receipt_show_membership_qr = true,
  updated_at = now()
WHERE store_code IS NOT NULL;
