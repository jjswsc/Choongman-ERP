-- members 커서 RPC만 재실행용 (tenant_id 는 이미 추가된 경우)
-- line_display_name 등 누락 컬럼을 채운 뒤 get_member_list_cursor 를 다시 만듭니다.

alter table public.members
  add column if not exists full_name text,
  add column if not exists line_display_name text,
  add column if not exists join_store_code text,
  add column if not exists source text,
  add column if not exists join_channel text,
  add column if not exists tier_code text,
  add column if not exists status text,
  add column if not exists point_balance numeric,
  add column if not exists tier_points numeric,
  add column if not exists lifetime_amount numeric,
  add column if not exists tenant_id text;

create index if not exists idx_members_tenant_id
  on public.members (tenant_id);

drop function if exists public.get_member_list_cursor(bigint, integer, text);
drop function if exists public.get_member_list_cursor(bigint, integer, text, text);
drop function if exists public.get_member_list_cursor(bigint, integer, text, text, text);
drop function if exists public.get_member_list_cursor(bigint, integer, text, text, text, text);

create function public.get_member_list_cursor(
  p_after_id bigint default null,
  p_limit integer default 100,
  p_q text default null,
  p_status text default 'active',
  p_tier_code text default null,
  p_tenant_id text default null
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
    m.birth_date::text,
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
  order by m.id desc
  limit greatest(1, least(coalesce(p_limit, 100), 500));
$$;
