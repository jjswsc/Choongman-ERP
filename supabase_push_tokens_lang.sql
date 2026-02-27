-- push_tokens에 수신자 언어(lang) 컬럼 추가
-- 알림 발송 시 수신자별 선호 언어로 자동 번역하여 전송
ALTER TABLE push_tokens ADD COLUMN IF NOT EXISTS lang TEXT DEFAULT 'ko';
COMMENT ON COLUMN push_tokens.lang IS '수신자 선호 언어: ko, en, th, my, lo';
