-- 이미 생성된 SaaS employees 테이블에 nick 컬럼 추가 (getLoginData 호환)
alter table if exists public.employees add column if not exists nick text;
