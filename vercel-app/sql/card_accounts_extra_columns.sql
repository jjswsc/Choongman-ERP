-- card_accounts: 카드번호·소유자·발급사(은행) 컬럼 추가
-- Supabase SQL Editor에서 실행 (idempotent).
-- 지출관리 > 카드관리 저장 시 PGRST204(card_company 없음) 오류 방지.

alter table public.card_accounts add column if not exists card_number text null;
alter table public.card_accounts add column if not exists holder_name text null;
alter table public.card_accounts add column if not exists card_company text null;

comment on column public.card_accounts.card_number is '카드번호 (마스킹 허용, 예: 4652 50XX XXXX 3081)';
comment on column public.card_accounts.holder_name is '카드 소유자명';
comment on column public.card_accounts.card_company is '카드사/발급 은행 (예: K-BANK)';
