-- stock_logs에 단가(unit_cost) 컬럼 추가 - 입고 시 할인 등 개별 단가 저장용
-- NULL이면 기존처럼 items.cost 사용
ALTER TABLE stock_logs ADD COLUMN IF NOT EXISTS unit_cost NUMERIC(12,2) DEFAULT NULL;
