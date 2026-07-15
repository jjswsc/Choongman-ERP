-- 회원 목록 커서 RPC: status 반환 + 기본 active만 조회
-- (status 미반환 시 앱이 inactive를 active로 표시하던 문제 방지)
--
-- Supabase SQL Editor에 붙여넣어 실행

drop function if exists public.get_member_list_cursor(bigint, integer, text);
drop function if exists public.get_member_list_cursor(bigint, integer, text, text);

create function public.get_member_list_cursor(
  p_after_id bigint default null,
  p_limit integer default 100,
  p_q text default null,
  p_status text default 'active'
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
  point_balance numeric,
  tier_points numeric,
  lifetime_amount numeric,
  join_channel text,
  join_store_code text,
  source text,
  line_display_name text,
  created_at timestamp without time zone,
  updated_at timestamp without time zone
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
    coalesce(m.status, 'active') as status,
    m.point_balance,
    m.tier_points,
    m.lifetime_amount,
    m.join_channel,
    m.join_store_code,
    m.source,
    m.line_display_name,
    m.created_at,
    m.updated_at
  from public.members m
  where
    (p_after_id is null or m.id < p_after_id)
    and (
      coalesce(trim(p_status), '') = ''
      or lower(trim(p_status)) = 'all'
      or coalesce(m.status, 'active') = trim(p_status)
    )
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
