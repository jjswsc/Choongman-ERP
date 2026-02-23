-- 패티캐시 회계 연동: 계정과목(항목) 컬럼 추가
ALTER TABLE petty_cash_transactions
ADD COLUMN IF NOT EXISTS account_subject_id BIGINT NULL;

CREATE INDEX IF NOT EXISTS idx_petty_cash_account_subject ON petty_cash_transactions(account_subject_id);

COMMENT ON COLUMN petty_cash_transactions.account_subject_id IS '계정과목 ID - account_subjects 참조, 회계 연동용';
