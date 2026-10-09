-- POS 결산: 현금(cash_amt) 추가, 카드/배달앱/QR 종류별 JSON
-- 사용법: Supabase SQL Editor에서 실행

ALTER TABLE pos_settlements ADD COLUMN IF NOT EXISTS cash_amt NUMERIC(12,2) DEFAULT 0;
ALTER TABLE pos_settlements ADD COLUMN IF NOT EXISTS card_breakdown JSONB DEFAULT '{}';
ALTER TABLE pos_settlements ADD COLUMN IF NOT EXISTS delivery_app_breakdown JSONB DEFAULT '{}';
ALTER TABLE pos_settlements ADD COLUMN IF NOT EXISTS qr_breakdown JSONB DEFAULT '{}';

-- 기존 행에 기본값
UPDATE pos_settlements SET cash_amt = 0 WHERE cash_amt IS NULL;
UPDATE pos_settlements SET card_breakdown = '{}' WHERE card_breakdown IS NULL;
UPDATE pos_settlements SET delivery_app_breakdown = '{}' WHERE delivery_app_breakdown IS NULL;
UPDATE pos_settlements SET qr_breakdown = '{}' WHERE qr_breakdown IS NULL;
