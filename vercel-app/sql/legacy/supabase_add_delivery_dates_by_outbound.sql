-- 주문별 출고지(창고)에 따른 배송일 저장
-- 예: {"본사":"2025-02-25","JIDUBANG":"2025-02-26"}
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_dates_by_outbound TEXT DEFAULT NULL;
