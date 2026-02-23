-- inbound_batches에 인보이스 수령 확인 컬럼 추가
ALTER TABLE inbound_batches ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT false;
