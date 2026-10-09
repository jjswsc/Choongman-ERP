-- ============================================================
-- 은행 적요 키워드 → 용도/계정과목 자동 지정 규칙
-- 설명 탭에서 규칙 추가 시 CSV 업로드 시 자동 적용
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_memo_rules (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  trans_type TEXT NOT NULL CHECK (trans_type IN ('deposit', 'withdraw')),
  category TEXT NOT NULL,
  account_subject_id BIGINT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_memo_rules_trans ON bank_memo_rules(trans_type);
COMMENT ON TABLE bank_memo_rules IS '은행 적요에 키워드 포함 시 지정할 용도/계정과목';
