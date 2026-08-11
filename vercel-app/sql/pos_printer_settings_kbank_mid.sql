-- 충만 관리자 POS 프린터 설정: 매장별 KBank MID
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS kbank_merchant_id text,
  ADD COLUMN IF NOT EXISTS kbank_partner_shop_id text,
  ADD COLUMN IF NOT EXISTS kbank_terminal_id text;

COMMENT ON COLUMN public.pos_printer_settings.kbank_merchant_id IS
  'KBank Merchant ID (예: KB000002340299). POS QR API 호출 시 매장별 MID.';
COMMENT ON COLUMN public.pos_printer_settings.kbank_partner_shop_id IS
  'KBank Partner Shop ID (예: SJGLB00006).';
COMMENT ON COLUMN public.pos_printer_settings.kbank_terminal_id IS
  'KBank terminalId (선택). Settlement/Credit QR 등에 사용.';

-- Huamak / Seacon 초기값 (이미 값이 있으면 유지)
UPDATE public.pos_printer_settings
SET
  kbank_merchant_id = COALESCE(NULLIF(trim(kbank_merchant_id), ''), 'KB000002340300'),
  kbank_partner_shop_id = COALESCE(NULLIF(trim(kbank_partner_shop_id), ''), 'SJGLB00007')
WHERE lower(replace(replace(trim(store_code), '_', ' '), '-', ' ')) LIKE '%huamak%'
   OR lower(trim(store_code)) IN ('cm huamak', 'huamak');

UPDATE public.pos_printer_settings
SET
  kbank_merchant_id = COALESCE(NULLIF(trim(kbank_merchant_id), ''), 'KB000002340299'),
  kbank_partner_shop_id = COALESCE(NULLIF(trim(kbank_partner_shop_id), ''), 'SJGLB00006')
WHERE lower(replace(replace(trim(store_code), '_', ' '), '-', ' ')) LIKE '%seacon%'
   OR lower(trim(store_code)) IN ('cm seacon srinakarin', 'seacon srinakarin');
