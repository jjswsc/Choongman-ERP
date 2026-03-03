-- ============================================================
-- bank_transactions에 ref_type, ref_id 추가 (인테리어 결제 연동)
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS ref_type TEXT DEFAULT NULL;

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS ref_id BIGINT DEFAULT NULL;

COMMENT ON COLUMN bank_transactions.ref_type IS 'InteriorExpense=인테리어 비용 결제 등';
COMMENT ON COLUMN bank_transactions.ref_id IS '연동 대상 ID (예: interior_expense_items.id)';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_ref ON bank_transactions(ref_type, ref_id)
WHERE ref_type IS NOT NULL AND ref_id IS NOT NULL;
