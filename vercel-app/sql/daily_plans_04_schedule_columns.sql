-- 일정표 고도화 — 템플릿 매장 간 이동 분 + 항목 지연 알림 기록
-- 컬럼 추가만. 기존 데이터 UPDATE 없음 (기본값으로 채워짐).

ALTER TABLE routine_templates ADD COLUMN IF NOT EXISTS travel_minutes integer NOT NULL DEFAULT 30;

ALTER TABLE daily_plan_items ADD COLUMN IF NOT EXISTS late_alerted_at timestamptz;
