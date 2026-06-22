-- 회원 포인트 관리 — 조건 검색 + 커서 페이지 (사용 가능·누적 포인트)
-- Supabase SQL Editor에 붙여넣기 1회 실행

drop function if exists public.search_members_points_cursor(
  bigint, integer, text, text, text, integer, integer, integer, integer
);

create function public.search_members_points_cursor(
  p_after_id bigint default null,
  p_limit integer default 100,
  p_q text default null,
  p_tier_code text default null,
  p_status text default null,
  p_point_balance_min integer default null,
  p_point_balance_max integer default null,
  p_tier_points_min integer default null,
  p_tier_points_max integer default null
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
  point_balance integer,
  tier_points integer,
  line_tier_points integer,
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
