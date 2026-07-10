-- 포인트 소수 2자리 지원 (적립·잔액·사용)
-- 예: Bronze 1% × 259바트 = 2.59P (기존 integer는 2P로 절사됨)
-- ⚠️ POS "invalid input syntax for type integer: 2.59" 오류 시 Supabase SQL Editor에서 1회 실행

-- 1) members
alter table public.members
  alter column point_balance type numeric(12,2) using round(coalesce(point_balance, 0)::numeric, 2),
  alter column tier_points type numeric(12,2) using round(coalesce(tier_points, 0)::numeric, 2);

alter table public.members
  alter column line_tier_points type numeric(12,2)
  using round(coalesce(line_tier_points, 0)::numeric, 2);

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = 'line_current_points'
  ) then
    execute $sql$
      alter table public.members
        alter column line_current_points type numeric(12,2)
        using round(coalesce(line_current_points, 0)::numeric, 2)
    $sql$;
  end if;
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'members' and column_name = 'line_total_points'
  ) then
    execute $sql$
      alter table public.members
        alter column line_total_points type numeric(12,2)
        using round(coalesce(line_total_points, 0)::numeric, 2)
    $sql$;
  end if;
end $$;

-- 2) 원장
alter table public.member_points_ledger
  alter column points type numeric(12,2) using round(coalesce(points, 0)::numeric, 2);

-- 3) POS 주문
alter table public.pos_orders
  alter column point_earned type numeric(12,2) using round(coalesce(point_earned, 0)::numeric, 2),
  alter column point_used type numeric(12,2) using round(coalesce(point_used, 0)::numeric, 2);

comment on column public.members.point_balance is '사용 가능 포인트 잔액 (소수 2자리, 1P=1바트 사용)';
comment on column public.members.tier_points is '등급 산정용 누적 포인트 (소수 2자리)';
comment on column public.member_points_ledger.points is '원장 포인트 변동 (소수 2자리)';
comment on column public.pos_orders.point_earned is '주문 적립 포인트 (소수 2자리)';
comment on column public.pos_orders.point_used is '주문 사용 포인트 (소수 2자리)';

-- 4) 회원 포인트 검색 RPC (반환 타입 numeric 맞춤)
drop function if exists public.search_members_points_cursor(
  bigint, integer, text, text, text, integer, integer, integer, integer
);
drop function if exists public.search_members_points_cursor(
  bigint, integer, text, text, text, numeric, numeric, numeric, numeric
);

create function public.search_members_points_cursor(
  p_after_id bigint default null,
  p_limit integer default 100,
  p_q text default null,
  p_tier_code text default null,
  p_status text default null,
  p_point_balance_min numeric default null,
  p_point_balance_max numeric default null,
  p_tier_points_min numeric default null,
  p_tier_points_max numeric default null
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
  status text,
  point_balance numeric(12,2),
  tier_points numeric(12,2),
  line_tier_points numeric(12,2),
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
    m.status,
    m.point_balance,
    m.tier_points,
    m.line_tier_points,
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
    and (
      coalesce(trim(p_tier_code), '') = ''
      or upper(coalesce(m.tier_code, '')) = upper(trim(p_tier_code))
    )
    and (
      coalesce(trim(p_status), '') = ''
      or coalesce(m.status, 'active') = trim(p_status)
    )
    and (p_point_balance_min is null or coalesce(m.point_balance, 0) >= p_point_balance_min)
    and (p_point_balance_max is null or coalesce(m.point_balance, 0) <= p_point_balance_max)
    and (
      p_tier_points_min is null
      or greatest(0, coalesce(m.tier_points, 0), coalesce(m.line_tier_points, 0)) >= p_tier_points_min
    )
    and (
      p_tier_points_max is null
      or greatest(0, coalesce(m.tier_points, 0), coalesce(m.line_tier_points, 0)) <= p_tier_points_max
    )
  order by m.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
