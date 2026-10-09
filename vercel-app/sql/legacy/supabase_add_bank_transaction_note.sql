-- ============================================================
-- bank_transactions에 note(상세 내용) 컬럼 추가
-- memo=은행 적요, note=사용자 입력 상세 내용 (상황 파악용)
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

ALTER TABLE bank_transactions
ADD COLUMN IF NOT EXISTS note TEXT DEFAULT '';

COMMENT ON COLUMN bank_transactions.note IS '사용자 입력 상세 내용 (은행 적요 외 별도 설명)';
