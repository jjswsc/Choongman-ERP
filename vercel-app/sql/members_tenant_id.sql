-- Omni SaaS: members 에 tenant_id 추가 (회사 간 회원 격리)
-- 대상: Omni Supabase. 충만 레거시 DB에는 실행하지 않는 것을 권장.
--
-- 신규 회사는 회원 0건이 정상입니다.

do $$
begin
  if to_regclass('public.members') is null then
    raise exception 'public.members 가 없습니다.';
  end if;

  alter table public.members
    add column if not exists tenant_id text;

  -- 커서 RPC / 앱이 참조하는 선택 컬럼 (Omni에 없을 수 있음)
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
    add column if not exists lifetime_amount numeric;

  create index if not exists idx_members_tenant_id
    on public.members (tenant_id);
end $$;

-- 백필: join_store_code → erp_stores.tenant_id
-- 충만 레거시 등 erp_stores.tenant_id 가 없으면 스킵
do $$
begin
  if to_regclass('public.erp_stores') is null then
    return;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'erp_stores'
      and column_name = 'tenant_id'
  ) then
    raise notice 'skip members tenant backfill: erp_stores.tenant_id missing';
    return;
  end if;

  update public.members m
  set tenant_id = es.tenant_id
  from public.erp_stores es
  where coalesce(trim(m.tenant_id), '') = ''
    and nullif(trim(es.tenant_id), '') is not null
    and lower(trim(coalesce(m.join_store_code, '')))
      = lower(trim(coalesce(es.store_code, '')));
end $$;

-- 테넌트가 하나뿐이면 orphan 일괄
do $$
declare
  tenant_cnt int;
  only_tenant text;
begin
  if to_regclass('public.tenants') is null then
    return;
  end if;

  select count(distinct nullif(trim(id), '')) into tenant_cnt from public.tenants;
  if tenant_cnt = 1 then
    select nullif(trim(id), '') into only_tenant from public.tenants limit 1;
    if only_tenant is not null then
      update public.members
      set tenant_id = only_tenant
      where coalesce(trim(tenant_id), '') = '';
    end if;
  end if;
end $$;

-- 전화 unique → 테넌트 단위 (회사마다 같은 번호 허용)
drop index if exists public.uq_members_phone_digits;
drop index if exists public.uq_members_phone_canonical;

create unique index if not exists uq_members_tenant_phone_canonical
on public.members (
  coalesce(tenant_id, ''),
  (
    case
      when regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') ~ '^66[0-9]{9,}$'
        then '0' || substr(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 3)
      when length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) = 9
        then '0' || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
      else regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
    end
  )
)
where status = 'active'
  and nullif(
    case
      when regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g') ~ '^66[0-9]{9,}$'
        then '0' || substr(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g'), 3)
      when length(regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')) = 9
        then '0' || regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
      else regexp_replace(coalesce(phone, ''), '[^0-9]', '', 'g')
    end,
    ''
  ) is not null;

-- 커서 RPC: p_tenant_id 추가 (Omni 필터)
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

-- 감사:
-- select count(*) from public.members where coalesce(trim(tenant_id), '') = '';
