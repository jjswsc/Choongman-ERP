-- ============================================================
-- 은행 적요 키워드 → 용도·계정과목 매핑 규칙 (설명 탭에서 설정)
-- CSV 업로드 시 특정 단어 포함 시 자동 용도·계정과목 지정
-- ============================================================

CREATE TABLE IF NOT EXISTS bank_memo_mapping_rules (
  id BIGSERIAL PRIMARY KEY,
  keyword TEXT NOT NULL,
  trans_type TEXT NOT NULL CHECK (trans_type IN ('deposit', 'withdraw')),
  category TEXT NOT NULL,
  account_subject_id BIGINT DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bank_memo_rules_trans_type ON bank_memo_mapping_rules(trans_type);
COMMENT ON TABLE bank_memo_mapping_rules IS '은행 적요 키워드로 용도·계정과목 자동 매칭 규칙';
