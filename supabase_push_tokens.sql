-- FCM 푸시 토큰 저장 (store|name 기준으로 푸시 발송 대상 매핑)
CREATE TABLE IF NOT EXISTS push_tokens (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  name TEXT NOT NULL,
  token TEXT NOT NULL,
  user_agent TEXT DEFAULT '',
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(store, name)
);
CREATE INDEX IF NOT EXISTS idx_push_tokens_store_name ON push_tokens(store, name);
CREATE INDEX IF NOT EXISTS idx_push_tokens_token ON push_tokens(token);
