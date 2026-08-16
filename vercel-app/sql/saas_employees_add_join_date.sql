-- Omni/SaaS employees 에 입사일 컬럼 추가 (업무일지 자동알림·재직 판정 호환)
-- 충만 본사 DB는 이미 있을 수 있음. IF NOT EXISTS 이라 중복 실행 안전.
alter table if exists public.employees add column if not exists join_date date;
