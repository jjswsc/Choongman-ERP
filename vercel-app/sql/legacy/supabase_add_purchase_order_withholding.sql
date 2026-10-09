-- ============================================================
-- 발주(PO) 원천징수세·인보이스 수령
-- 매입 입력 시 원천징수세 입력, 인보이스 수령 체크
-- ============================================================

-- 1. purchase_orders 확장
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS withholding_tax_amount NUMERIC(12,2) DEFAULT 0;
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS withholding_tax_rate NUMERIC(5,2) DEFAULT NULL;
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS invoice_received BOOLEAN DEFAULT FALSE;
ALTER TABLE purchase_orders
ADD COLUMN IF NOT EXISTS invoice_no TEXT DEFAULT NULL;

COMMENT ON COLUMN purchase_orders.withholding_tax_amount IS '원천징수세 금액 (실지급액 = total - withholding_tax_amount)';
COMMENT ON COLUMN purchase_orders.withholding_tax_rate IS '원천징수세율 (%) - 참고용';
COMMENT ON COLUMN purchase_orders.invoice_received IS '인보이스 수령 여부';
COMMENT ON COLUMN purchase_orders.invoice_no IS '인보이스 번호';

-- 2. account_subjects에 원천징수세율 (태국 법 - 계정과목별 비율)
ALTER TABLE account_subjects
ADD COLUMN IF NOT EXISTS withholding_tax_rate NUMERIC(5,2) DEFAULT NULL;
COMMENT ON COLUMN account_subjects.withholding_tax_rate IS '원천징수세율 (%) - 태국 법 계정과목별';
