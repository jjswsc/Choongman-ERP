-- 매장 개선 과제 v2 — 점검 항목 재발 연결 + 변경 이력(타임라인)
-- store_action_items_schema.sql 실행 후 1회 실행. 기존 데이터 UPDATE 없음(컬럼 추가·신규 테이블만).

ALTER TABLE store_action_items ADD COLUMN IF NOT EXISTS check_item_id text NOT NULL DEFAULT '';
ALTER TABLE store_action_items ADD COLUMN IF NOT EXISTS parent_action_id bigint;

CREATE INDEX IF NOT EXISTS idx_store_action_items_check_item ON store_action_items (store_name, check_item_id);
CREATE INDEX IF NOT EXISTS idx_store_action_items_verifier ON store_action_items (verifier_name);
CREATE INDEX IF NOT EXISTS idx_store_action_items_completed ON store_action_items (completed_at DESC);

CREATE TABLE IF NOT EXISTS store_action_logs (
  id bigserial PRIMARY KEY,
  action_id bigint NOT NULL,
  actor text NOT NULL DEFAULT '',
  event text NOT NULL DEFAULT '',
  from_status text NOT NULL DEFAULT '',
  to_status text NOT NULL DEFAULT '',
  note text NOT NULL DEFAULT '',
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_store_action_logs_action ON store_action_logs (action_id, created_at);
