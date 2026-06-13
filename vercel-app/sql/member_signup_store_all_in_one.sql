-- =============================================================================
-- 회원 가입 매장 (join_store_code) — Supabase SQL Editor 한 번에 붙여넣기
-- =============================================================================
-- 포함: members.join_store_code · erp_stores 다국어 표시명 · 월별 가입 목표
--       get_member_signup_store_stats · get_member_list_cursor(+join_store_code)
-- 재실행 가능(idempotent). 이미 일부 적용돼도 안전.
-- =============================================================================

-- 1) members — 가입 매장 코드
alter table public.members
  add column if not exists join_store_code text;

comment on column public.members.join_store_code is
  '회원앱 가입 시 선택 매장. office=온라인(본사), 그 외 erp_stores.store_code';

create index if not exists idx_members_join_store_code on public.members (join_store_code);
create index if not exists idx_members_created_at on public.members (created_at desc);

-- 2) erp_stores — 회원앱 다국어 표시명
alter table public.erp_stores
  add column if not exists display_name_ko text,
  add column if not exists display_name_en text,
  add column if not exists display_name_th text;

comment on column public.erp_stores.display_name_ko is '회원앱·가입 매장 선택 — 한국어 (비우면 display_name)';
comment on column public.erp_stores.display_name_en is '회원앱·가입 매장 선택 — English';
comment on column public.erp_stores.display_name_th is '회원앱·가입 매장 선택 — ไทย';

-- 3) 월별 매장별 가입 목표
create table if not exists public.member_signup_store_goals (
  id bigserial primary key,
  store_code text not null,
  month_ymd text not null,
  target_count integer not null default 0 check (target_count >= 0),
  created_at timestamp without time zone,
  updated_at timestamp without time zone,
  unique (store_code, month_ymd)
);

create index if not exists idx_member_signup_store_goals_month
  on public.member_signup_store_goals (month_ymd, store_code);

-- 4) 가입 매장별 집계 RPC (회원앱 app + LINE line)
create or replace function public.get_member_signup_store_stats(
  p_from timestamptz,
  p_to timestamptz
)
returns table (
  join_store_code text,
  signup_count bigint
)
language sql
stable
as $$
  select
    coalesce(nullif(trim(m.join_store_code), ''), '__unset__') as join_store_code,
    count(*)::bigint as signup_count
  from public.members m
  where m.created_at >= p_from
    and m.created_at <= p_to
    and coalesce(m.source, '') in ('app', 'line')
  group by 1
  order by signup_count desc, join_store_code asc;
$$;

-- 5) CRM 회원 목록 커서 — join_store_code 추가
--    반환 타입 변경 시 CREATE OR REPLACE 불가 → DROP 후 재생성
drop function if exists public.get_member_list_cursor(bigint, integer, text);

create function public.get_member_list_cursor(
  p_after_id bigint default null,
  p_limit integer default 100,
  p_q text default null
)
returns table (
  id bigint,
  member_no text,
  name text,
  full_name text,
  phone text,
  email text,
  birth_date text,
  gender text,
  nationality text,
  tier_code text,
  point_balance integer,
  lifetime_amount numeric,
  join_channel text,
  join_store_code text,
  created_at timestamp without time zone
)
language sql
stable
as $$
  select
    m.id,
    m.member_no,
    m.name,
    m.full_name,
    m.phone,
    m.email,
    m.birth_date,
    m.gender,
    m.nationality,
    m.tier_code,
    m.point_balance,
    m.lifetime_amount,
    m.join_channel,
    m.join_store_code,
    m.created_at
  from public.members m
  where
    (p_after_id is null or m.id < p_after_id)
    and (
      coalesce(trim(p_q), '') = ''
      or m.name ilike ('%' || p_q || '%')
      or coalesce(m.full_name, '') ilike ('%' || p_q || '%')
      or coalesce(m.phone, '') ilike ('%' || p_q || '%')
      or coalesce(m.member_no, '') ilike ('%' || p_q || '%')
      or coalesce(m.email, '') ilike ('%' || p_q || '%')
    )
  order by m.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
