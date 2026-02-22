-- ============================================================
-- bank_transactions에 category(용도) 컬럼 추가
-- 이체/보충: 패티캐시 보충 등 - 손익계산서 비용에서 제외
-- 비용: 일반 경비
-- 고정비: 월세, 감가상각 등 - 통장 관리 페이지에서 지정
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT 'expense';

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS fixed_expense_id BIGINT NULL;

COMMENT ON COLUMN bank_transactions.category IS 'transfer=이체/보충(비용제외), expense=비용, fixed=고정비';

CREATE INDEX IF NOT EXISTS idx_bank_transactions_category ON bank_transactions(category);
