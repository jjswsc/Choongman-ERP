-- POS 영수증 커스텀 문구/이미지(로고·도장·멤버십 QR) 컬럼 추가
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS receipt_footer_primary_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_footer_secondary_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_logo_image_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_stamp_image_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_show_stamp BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_stamp_only_tax_invoice BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_image_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_link_url TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_text TEXT DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_show_membership_qr BOOLEAN DEFAULT false;
