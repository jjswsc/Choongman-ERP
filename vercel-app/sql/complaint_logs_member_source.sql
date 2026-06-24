-- complaint_logs: 회원앱 유입·CRM 연동
ALTER TABLE complaint_logs
  ADD COLUMN IF NOT EXISTS member_id BIGINT,
  ADD COLUMN IF NOT EXISTS source_channel TEXT NOT NULL DEFAULT '';

CREATE INDEX IF NOT EXISTS idx_complaint_logs_member_id ON complaint_logs(member_id);
CREATE INDEX IF NOT EXISTS idx_complaint_logs_source_channel ON complaint_logs(source_channel);

COMMENT ON COLUMN complaint_logs.member_id IS '회원 CRM members.id (회원앱 접수 시)';
COMMENT ON COLUMN complaint_logs.source_channel IS '유입: member_portal, admin, staff 등';
