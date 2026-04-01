-- Supabase SQL Editor에서 1회 실행: 가맹점주 복수 매장(extra_stores)
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS extra_stores jsonb NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN public.employees.extra_stores IS '가맹점주 추가 매장명 배열 JSON (대표 store 제외)';
