-- 호칭(Mr./Miss 등) — 닉네임(nick)과 별도 컬럼
ALTER TABLE public.employees
ADD COLUMN IF NOT EXISTS name_title text NOT NULL DEFAULT '';
