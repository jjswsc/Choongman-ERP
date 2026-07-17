-- complaint_logs: 회원앱에 노출할 고객용 답변 (내부 action 과 분리)
ALTER TABLE complaint_logs
  ADD COLUMN IF NOT EXISTS customer_reply TEXT NOT NULL DEFAULT '';

COMMENT ON COLUMN complaint_logs.customer_reply IS '회원앱에 보이는 고객용 답변 (내부 action 과 분리)';

-- 기존: 처리완료 + action 이 있으면 고객 답변으로 1회 백필 (이미 customer_reply 있으면 건은 유지)
UPDATE complaint_logs
SET customer_reply = action
WHERE COALESCE(NULLIF(TRIM(customer_reply), ''), '') = ''
  AND COALESCE(NULLIF(TRIM(action), ''), '') <> ''
  AND status = '처리완료';
