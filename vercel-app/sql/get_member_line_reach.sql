-- 회원 LINE 메시지 수신 통계 + 목록 필터
-- 수신 가능 = member_identities.provider='line' AND status='active' AND user id 있음
-- (언팔로우로 inactive 된 연결은 수신 불가로 센다)
--
-- Supabase SQL Editor에 이 파일 전체를 한 번 붙여넣고 Run

create index if not exists idx_member_identities_provider_status_member
  on public.member_identities (provider, status, member_id);

create or replace function public.get_member_line_reach_stats(
  p_status text default 'active',
  p_tier_code text default null,
  p_tenant_id text default null
)
returns table (
  total bigint,
  reachable bigint,
  unreachable bigint
)
language sql
stable
as $$
  with scoped as (
    select
      exists (
        select 1
        from public.member_identities i
        where i.member_id = m.id
          and i.provider = 'line'
          and lower(coalesce(i.status, 'active')) = 'active'
          and coalesce(trim(i.provider_user_id), '') <> ''
      ) as reachable
    from public.members m
    where
      (
        coalesce(trim(p_tenant_id), '') = ''
        or coalesce(trim(m.tenant_id), '') = trim(p_tenant_id)
      )
      and (
        coalesce(trim(p_status), '') = ''
        or lower(trim(p_status)) = 'all'
        or coalesce(m.status, 'active') = trim(p_status)
      )
      and (
        coalesce(trim(p_tier_code), '') = ''
        or upper(coalesce(nullif(trim(m.tier_code), ''), 'BRONZE')) = upper(trim(p_tier_code))
      )
  )
  select
    count(*)::bigint as total,
    count(*) filter (where reachable)::bigint as reachable,
    count(*) filter (where not reachable)::bigint as unreachable
  from scoped;
$$;

create or replace function public.get_member_list_line_reach_cursor(
  p_after_id bigint default null,
  p_limit integer default 100,
  p_q text default null,
  p_status text default 'active',
  p_tier_code text default null,
  p_tenant_id text default null,
  p_line_reach text default null
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
      coalesce(trim(p_tenant_id), '') = ''
      or coalesce(trim(m.tenant_id), '') = trim(p_tenant_id)
    )
    and (
      coalesce(trim(p_status), '') = ''
      or lower(trim(p_status)) = 'all'
      or coalesce(m.status, 'active') = trim(p_status)
    )
    and (
      coalesce(trim(p_tier_code), '') = ''
      or upper(coalesce(nullif(trim(m.tier_code), ''), 'BRONZE')) = upper(trim(p_tier_code))
    )
    and (
      coalesce(trim(p_q), '') = ''
      or m.name ilike ('%' || p_q || '%')
      or coalesce(m.full_name, '') ilike ('%' || p_q || '%')
      or coalesce(m.phone, '') ilike ('%' || p_q || '%')
      or coalesce(m.member_no, '') ilike ('%' || p_q || '%')
      or coalesce(m.email, '') ilike ('%' || p_q || '%')
    )
    and (
      coalesce(trim(p_line_reach), '') = ''
      or lower(trim(p_line_reach)) = 'all'
      or (
        lower(trim(p_line_reach)) = 'reachable'
        and exists (
          select 1
          from public.member_identities i
          where i.member_id = m.id
            and i.provider = 'line'
            and lower(coalesce(i.status, 'active')) = 'active'
            and coalesce(trim(i.provider_user_id), '') <> ''
        )
      )
      or (
        lower(trim(p_line_reach)) = 'unreachable'
        and not exists (
          select 1
          from public.member_identities i
          where i.member_id = m.id
            and i.provider = 'line'
            and lower(coalesce(i.status, 'active')) = 'active'
            and coalesce(trim(i.provider_user_id), '') <> ''
        )
      )
    )
  order by m.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;

grant execute on function public.get_member_line_reach_stats(text, text, text) to service_role;
grant execute on function public.get_member_list_line_reach_cursor(bigint, integer, text, text, text, text, text) to service_role;
