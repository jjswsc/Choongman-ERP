-- inbound_batches에 PO 번호 컬럼 추가 (발주번호와 인보이스 번호 분리 관리)
-- po_no: 발주서 번호 (PO-2024-001 등)
-- invoice_no: 거래처 인보이스 번호
ALTER TABLE inbound_batches ADD COLUMN IF NOT EXISTS po_no TEXT DEFAULT NULL;
