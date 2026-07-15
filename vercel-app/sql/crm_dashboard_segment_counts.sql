-- CRM 대시보드: 세그먼트 카운트 + 매장별 회원 집계
-- Supabase SQL Editor에 붙여넣어 실행

create or replace function public.get_crm_segment_counts(
  p_recent_days integer default 30,
  p_dormant_days integer default 90,
  p_store_code text default null,
  p_points_min numeric default 100
)
returns table (
  recent30 bigint,
  dormant90 bigint,
  new30 bigint,
  vip bigint,
  at_risk bigint,
  birthday7 bigint,
  points_idle bigint
)
language plpgsql
stable
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
  v_recent_start timestamptz := ((v_today - greatest(coalesce(p_recent_days, 30), 1))::timestamp at time zone 'Asia/Bangkok');
  v_dormant_before timestamptz := ((v_today - greatest(coalesce(p_dormant_days, 90), 1))::timestamp at time zone 'Asia/Bangkok');
  v_store text := nullif(trim(coalesce(p_store_code, '')), '');
begin
  return query
  with base as (
    select m.*
    from public.members m
    where coalesce(m.status, 'active') = 'active'
      and (
        v_store is null
        or (v_store = '__unset__' and coalesce(trim(m.join_store_code), '') = '')
        or m.join_store_code = v_store
      )
  ),
  bdays as (
    select to_char(d::date, 'MM-DD') as md
    from generate_series(v_today - 7, v_today + 7, interval '1 day') d
  )
  select
    (
      select count(distinct o.member_id)::bigint
      from public.pos_orders o
      join base m on m.id = o.member_id
      where o.member_id is not null
        and o.created_at >= v_recent_start
    ) as recent30,
    (
      select count(*)::bigint
      from base m
      where m.last_visited_at is null or m.last_visited_at < v_dormant_before
    ) as dormant90,
    (
      select count(*)::bigint
      from base m
      where m.created_at >= v_recent_start
    ) as new30,
    (
      select count(*)::bigint
      from base m
      where upper(coalesce(m.tier_code, '')) = 'VIP'
    ) as vip,
    (
      select count(*)::bigint
      from base m
      where m.last_visited_at >= v_dormant_before
        and m.last_visited_at < v_recent_start
    ) as at_risk,
    (
      select count(*)::bigint
      from base m
      where m.birth_date is not null
        and trim(m.birth_date::text) ~ '^\d{4}-\d{2}-\d{2}'
        and to_char((trim(m.birth_date::text))::date, 'MM-DD') in (select md from bdays)
    ) as birthday7,
    (
      select count(*)::bigint
      from base m
      where coalesce(m.point_balance, 0) >= coalesce(p_points_min, 100)
    ) as points_idle;
end;
$$;

create or replace function public.get_crm_store_member_stats(
  p_recent_days integer default 30,
  p_dormant_days integer default 90
)
returns table (
  store_code text,
  active_members bigint,
  new_members bigint,
  dormant_members bigint
)
language sql
stable
as $$
  with bounds as (
    select
      (now() at time zone 'Asia/Bangkok')::date as today,
      ((now() at time zone 'Asia/Bangkok')::date - greatest(coalesce(p_recent_days, 30), 1))::timestamp
        at time zone 'Asia/Bangkok' as recent_start,
      ((now() at time zone 'Asia/Bangkok')::date - greatest(coalesce(p_dormant_days, 90), 1))::timestamp
        at time zone 'Asia/Bangkok' as dormant_before
  )
  select
    coalesce(nullif(trim(m.join_store_code), ''), '__unset__') as store_code,
    count(*)::bigint as active_members,
    count(*) filter (where m.created_at >= b.recent_start)::bigint as new_members,
    count(*) filter (
      where m.last_visited_at is null or m.last_visited_at < b.dormant_before
    )::bigint as dormant_members
  from public.members m
  cross join bounds b
  where coalesce(m.status, 'active') = 'active'
  group by 1
  order by active_members desc;
$$;
