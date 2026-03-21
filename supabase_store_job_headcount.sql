-- 매장×직무(부서) 적정인원. Supabase SQL Editor에서 1회 실행.
-- 직원 관리 > 적정인원 탭에서 사용.

CREATE TABLE IF NOT EXISTS store_job_headcount (
  id BIGSERIAL PRIMARY KEY,
  store TEXT NOT NULL,
  job TEXT NOT NULL,
  target_count INTEGER NOT NULL DEFAULT 0 CHECK (target_count >= 0),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by TEXT,
  UNIQUE (store, job)
);

CREATE INDEX IF NOT EXISTS idx_store_job_headcount_store ON store_job_headcount (store);

COMMENT ON TABLE store_job_headcount IS '매장별 직무(job) 적정인원 목표';
