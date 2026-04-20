-- 방향 B: 평가 JSON과 별도의 경고·사건 독립 등록 + 결재 상태
CREATE TABLE IF NOT EXISTS employee_warning_letter_registry (
  id BIGSERIAL PRIMARY KEY,
  store_name TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  incident_date DATE,
  incident_type TEXT NOT NULL DEFAULT '',
  details TEXT NOT NULL DEFAULT '',
  warning_letter_url TEXT,
  evaluator_name TEXT NOT NULL DEFAULT '',
  approval_status TEXT NOT NULL DEFAULT 'draft'
    CHECK (approval_status IN ('draft', 'pending', 'approved', 'rejected')),
  approved_by TEXT,
  approved_at TIMESTAMPTZ,
  rejected_reason TEXT,
  created_by TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ewlr_store ON employee_warning_letter_registry (store_name);
CREATE INDEX IF NOT EXISTS idx_ewlr_status ON employee_warning_letter_registry (approval_status);
CREATE INDEX IF NOT EXISTS idx_ewlr_incident_date ON employee_warning_letter_registry (incident_date);

COMMENT ON TABLE employee_warning_letter_registry IS
  '경고·사건 독립 등록(평가 JSON 외). 결재: draft→pending→approved/rejected';

-- 첨부 파일: Storage 버킷 `employee-warning-letters` (공개 읽기).
--   최초 업로드 시 API `/api/uploadWarningLetterRegistry/presign` 이 없으면 자동 생성함.
