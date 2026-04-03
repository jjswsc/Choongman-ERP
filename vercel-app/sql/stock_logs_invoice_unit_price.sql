-- 출고(주문 수령·강제출고) 확정 시점 단가 스냅샷.
-- NULL: 기존처럼 orders.cart_json / 품목 마스터 단가 사용.
-- 값 있음: 인보이스·미수금·출고 이력 합계는 마스터 가격 변경과 무관하게 유지.

ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS invoice_unit_price NUMERIC(14, 4) NULL;

COMMENT ON COLUMN stock_logs.invoice_unit_price IS
  'Outbound/ForceOutbound: THB unit price frozen at ship time for invoice & receivable.';
