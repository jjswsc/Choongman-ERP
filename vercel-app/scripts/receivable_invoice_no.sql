-- receivable_transactions에 인보이스 번호 컬럼 추가
-- 미수금은 출고 수령 시점(인보이스 발행)에 생성되며, 출고 관리와 동일한 인보이스 번호로 표시
-- 실행: Supabase SQL Editor에서 실행

ALTER TABLE receivable_transactions ADD COLUMN IF NOT EXISTS invoice_no TEXT DEFAULT NULL;
COMMENT ON COLUMN receivable_transactions.invoice_no IS '인보이스 번호 (출고 수령 시 IV{yyyymmdd}-{orderId})';
