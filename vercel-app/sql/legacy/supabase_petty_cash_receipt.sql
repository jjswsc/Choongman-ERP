-- 패티 캐쉬 영수증 사진 (receipt_url: data URL 또는 외부 URL)
ALTER TABLE petty_cash_transactions ADD COLUMN IF NOT EXISTS receipt_url TEXT DEFAULT NULL;
