-- CRM 대시보드 KPI 요약: 가입 매장(join_store_code) 필터 추가
-- 기존 2인자 시그니처와 인자 개수가 다르므로 DROP 후 재생성합니다.
-- Supabase SQL Editor에 이 파일만 복사 → Run

drop function if exists public.get_member_crm_summary(integer, integer);
drop function if exists public.get_member_crm_summary(integer, integer, text);

create or replace function public.get_member_crm_summary(
  p_recent_days integer default 30,
  p_dormant_days integer default 90,
  p_store_code text default null
)
returns table (
  total_members bigint,
  recent_active_members bigint,
  dormant_members bigint,
  total_lifetime_amount numeric,
  avg_order_amount numeric
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
    where (
      v_store is null
      or (v_store = '__unset__' and coalesce(trim(m.join_store_code), '') = '')
      or m.join_store_code = v_store
    )
  ),
  orders as (
    select o.member_id, o.total, o.created_at
    from public.pos_orders o
    join base m on m.id = o.member_id
    where coalesce(o.member_id, 0) > 0
  )
  select
    (select count(*)::bigint from base) as total_members,
    (
      select count(distinct o.member_id)::bigint
      from orders o
      where o.created_at >= v_recent_start
    ) as recent_active_members,
    (
      select count(*)::bigint
      from base m
      where not exists (
        select 1
        from orders o
        where o.member_id = m.id
          and o.created_at >= v_dormant_before
      )
    ) as dormant_members,
    coalesce((select sum(m.lifetime_amount) from base m), 0) as total_lifetime_amount,
    coalesce((select avg(o.total) from orders o), 0) as avg_order_amount;
end;
$$;
