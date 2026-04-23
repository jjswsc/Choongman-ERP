-- 물류 고도화 통합본 (하드닝 + 무결성 점검 + KPI)
-- 실행 방법:
-- 1) 이 파일 전체를 한 번에 실행해도 됨
-- 2) 하드닝(DML/DDL)은 트랜잭션으로 반영됨
-- 3) 뒤쪽 점검/대시보드 쿼리는 조회 결과를 반환함
--
-- 권장 순서(내부 포함):
--   A. 하드닝
--   B. 무결성 점검 배치 쿼리
--   C. KPI 대시보드 쿼리

-- =========================================================
-- A) 하드닝
-- =========================================================
begin;

-- A-1. stock_logs: 활성 출고 조회 성능 보강
do $$
begin
  if to_regclass('public.stock_logs') is null then
    raise notice 'public.stock_logs table does not exist. Skip stock_logs hardening.';
    return;
  end if;

  create index if not exists idx_stock_logs_outbound_active_vendor_date
    on public.stock_logs(log_type, is_deleted, vendor_target, log_date desc)
    where log_type in ('Outbound', 'ForceOutbound', 'ForcePush');

  create index if not exists idx_stock_logs_force_outbound_active_id
    on public.stock_logs(id)
    where log_type = 'ForceOutbound' and coalesce(is_deleted, false) = false;
end
$$;

-- A-2. outbound_delete_events: request_key 인덱스 + 중복 없을 때 유니크 강제
do $$
begin
  if to_regclass('public.outbound_delete_events') is null then
    raise notice 'public.outbound_delete_events table does not exist. Skip request_key hardening.';
    return;
  end if;

  create index if not exists idx_outbound_delete_events_request_key
    on public.outbound_delete_events(request_key)
    where request_key is not null and btrim(request_key) <> '';

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'ux_outbound_delete_events_request_key_norm'
  ) then
    if exists (
      select 1
      from public.outbound_delete_events e
      where e.request_key is not null and btrim(e.request_key) <> ''
      group by lower(btrim(e.request_key))
      having count(*) > 1
    ) then
      raise notice 'Skip unique request_key index: duplicated normalized request_key exists.';
    else
      execute '
        create unique index ux_outbound_delete_events_request_key_norm
          on public.outbound_delete_events ((lower(btrim(request_key))))
          where request_key is not null and btrim(request_key) <> ''''
      ';
    end if;
  end if;
end
$$;

-- A-3. receivable_transactions: 삭제된 ForceOutbound 참조 사전 차단 트리거
do $$
begin
  if to_regclass('public.receivable_transactions') is null then
    raise notice 'public.receivable_transactions table does not exist. Skip receivable guard.';
    return;
  end if;
  if to_regclass('public.stock_logs') is null then
    raise notice 'public.stock_logs table does not exist. Skip receivable guard.';
    return;
  end if;

  execute $fn$
    create or replace function public.guard_receivable_force_outbound_active()
    returns trigger
    language plpgsql
    as $body$
    declare
      v_ref_type text := upper(btrim(coalesce(new.ref_type, '')));
      v_ref_id bigint := coalesce(new.ref_id, 0);
      v_ok boolean := false;
    begin
      if v_ref_type <> 'FORCEOUTBOUND' then
        return new;
      end if;

      if v_ref_id <= 0 then
        raise exception 'ForceOutbound receivable requires positive ref_id';
      end if;

      select exists (
        select 1
        from public.stock_logs s
        where s.id = v_ref_id
          and s.log_type = 'ForceOutbound'
          and coalesce(s.is_deleted, false) = false
      ) into v_ok;

      if not v_ok then
        raise exception 'Cannot reference deleted/non-existing ForceOutbound stock_log (ref_id=%)', v_ref_id;
      end if;

      return new;
    end
    $body$;
  $fn$;

  execute 'alter function public.guard_receivable_force_outbound_active() set search_path = public';
  execute 'drop trigger if exists trg_receivable_force_outbound_active_guard on public.receivable_transactions';
  execute '
    create trigger trg_receivable_force_outbound_active_guard
    before insert or update of ref_type, ref_id
    on public.receivable_transactions
    for each row
    execute function public.guard_receivable_force_outbound_active()
  ';
end
$$;

commit;

-- =========================================================
-- B) 무결성 점검 배치 쿼리
-- =========================================================
-- [Q1] 삭제된 ForceOutbound인데 미수금(ref ForceOutbound)이 남아있는 건
select
  s.id as stock_log_id,
  s.vendor_target as store_name,
  s.log_date,
  rt.id as receivable_id,
  rt.amount
from public.stock_logs s
join public.receivable_transactions rt
  on rt.ref_type = 'ForceOutbound'
 and rt.ref_id = s.id
where s.log_type = 'ForceOutbound'
  and coalesce(s.is_deleted, false) = true
order by s.id desc
limit 200;

-- [Q2] ForceOutbound 미수금이 삭제/미존재 stock_logs를 참조하는 고아 레코드
select
  rt.id as receivable_id,
  rt.store_name,
  rt.ref_id as stock_log_id,
  rt.amount,
  case
    when s.id is null then 'missing_stock_log'
    when coalesce(s.is_deleted, false) = true then 'deleted_stock_log'
    when s.log_type <> 'ForceOutbound' then 'wrong_log_type'
    else 'ok'
  end as issue
from public.receivable_transactions rt
left join public.stock_logs s
  on s.id = rt.ref_id
where rt.ref_type = 'ForceOutbound'
  and (
    s.id is null
    or coalesce(s.is_deleted, false) = true
    or s.log_type <> 'ForceOutbound'
  )
order by rt.id desc
limit 200;

-- [Q3] 주문 출고가 모두 삭제됐는데 Order 미수가 남아있는 건
select
  o.id as order_id,
  o.store_name,
  sum(rt.amount) as receivable_amount,
  count(s.id) as active_outbound_log_count
from public.orders o
join public.receivable_transactions rt
  on rt.ref_type = 'Order'
 and rt.ref_id = o.id
left join public.stock_logs s
  on s.order_id = o.id
 and s.log_type = 'Outbound'
 and coalesce(s.is_deleted, false) = false
group by o.id, o.store_name
having count(s.id) = 0
order by o.id desc
limit 200;

-- [Q4] 매장별 미수 잔액 음수 (수금 초과 의심)
select
  rt.store_name,
  sum(rt.amount) as outstanding
from public.receivable_transactions rt
group by rt.store_name
having sum(rt.amount) < 0
order by outstanding asc;

-- [Q5] 삭제 이벤트 request_key 중복(재시도 충돌/중복처리 위험)
select
  lower(btrim(e.request_key)) as normalized_request_key,
  count(*) as cnt,
  min(e.created_at) as first_seen_at,
  max(e.created_at) as last_seen_at
from public.outbound_delete_events e
where e.request_key is not null
  and btrim(e.request_key) <> ''
group by lower(btrim(e.request_key))
having count(*) > 1
order by cnt desc, last_seen_at desc
limit 200;

-- [Q6] 오늘(방콕) 삭제 처리 요약
with bkk_now as (
  select timezone('Asia/Bangkok', now()) as now_bkk
),
bkk_window as (
  select
    date_trunc('day', now_bkk) as start_bkk,
    date_trunc('day', now_bkk) + interval '1 day' as end_bkk
  from bkk_now
)
select
  e.mode,
  count(*) as event_count,
  coalesce(sum(e.deleted_count), 0) as deleted_row_count
from public.outbound_delete_events e
cross join bkk_window w
where timezone('Asia/Bangkok', e.created_at) >= w.start_bkk
  and timezone('Asia/Bangkok', e.created_at) < w.end_bkk
group by e.mode
order by event_count desc;

-- =========================================================
-- C) KPI 대시보드 쿼리
-- =========================================================
-- 공통 기간 파라미터 (필요 시 수정)
with params as (
  select
    (timezone('Asia/Bangkok', now())::date - 29)::date as start_date_bkk,
    timezone('Asia/Bangkok', now())::date as end_date_bkk
)
select * from params;

-- [KPI-1] 일자별 출고 처리량(건수/수량) + 강제출고 비율
with params as (
  select
    (timezone('Asia/Bangkok', now())::date - 29)::date as start_date_bkk,
    timezone('Asia/Bangkok', now())::date as end_date_bkk
),
days as (
  select generate_series(
    (select start_date_bkk from params),
    (select end_date_bkk from params),
    interval '1 day'
  )::date as biz_date
),
base as (
  select
    s.log_date::date as biz_date,
    s.log_type,
    count(*) as row_count,
    sum(abs(coalesce(s.qty, 0)))::numeric as qty_sum
  from public.stock_logs s
  cross join params p
  where s.log_date::date between p.start_date_bkk and p.end_date_bkk
    and s.log_type in ('Outbound', 'ForceOutbound', 'ForcePush')
    and coalesce(s.is_deleted, false) = false
  group by s.log_date::date, s.log_type
),
pivoted as (
  select
    b.biz_date,
    sum(b.row_count) as outbound_count,
    sum(b.qty_sum) as outbound_qty,
    sum(case when b.log_type in ('ForceOutbound', 'ForcePush') then b.row_count else 0 end) as force_outbound_count
  from base b
  group by b.biz_date
)
select
  d.biz_date,
  coalesce(p.outbound_count, 0) as outbound_count,
  coalesce(p.outbound_qty, 0)::numeric as outbound_qty,
  coalesce(p.force_outbound_count, 0) as force_outbound_count,
  case
    when coalesce(p.outbound_count, 0) = 0 then 0::numeric
    else round((p.force_outbound_count::numeric / p.outbound_count::numeric) * 100, 2)
  end as force_outbound_ratio_pct
from days d
left join pivoted p on p.biz_date = d.biz_date
order by d.biz_date asc;

-- [KPI-2] 매장별 미수 잔액 TOP (현재 스냅샷)
select
  rt.store_name,
  sum(rt.amount)::numeric as outstanding_amount
from public.receivable_transactions rt
group by rt.store_name
order by outstanding_amount desc
limit 30;

-- [KPI-3] 매장별 출고 삭제율 (최근 30일)
with params as (
  select
    (timezone('Asia/Bangkok', now())::date - 29)::date as start_date_bkk,
    timezone('Asia/Bangkok', now())::date as end_date_bkk
),
agg as (
  select
    coalesce(nullif(btrim(s.vendor_target), ''), '미지정') as store_name,
    count(*) filter (
      where s.log_type in ('Outbound', 'ForceOutbound', 'ForcePush')
    ) as total_outbound_rows,
    count(*) filter (
      where s.log_type in ('Outbound', 'ForceOutbound', 'ForcePush')
        and coalesce(s.is_deleted, false) = true
    ) as deleted_outbound_rows
  from public.stock_logs s
  cross join params p
  where s.log_date::date between p.start_date_bkk and p.end_date_bkk
  group by coalesce(nullif(btrim(s.vendor_target), ''), '미지정')
)
select
  a.store_name,
  a.total_outbound_rows,
  a.deleted_outbound_rows,
  case
    when a.total_outbound_rows = 0 then 0::numeric
    else round((a.deleted_outbound_rows::numeric / a.total_outbound_rows::numeric) * 100, 2)
  end as delete_ratio_pct
from agg a
where a.total_outbound_rows > 0
order by delete_ratio_pct desc, a.total_outbound_rows desc;

-- [KPI-4] 삭제 이벤트 일자별 건수/삭제행수 (최근 30일, 방콕 기준)
with params as (
  select
    (timezone('Asia/Bangkok', now())::date - 29)::date as start_date_bkk,
    timezone('Asia/Bangkok', now())::date as end_date_bkk
),
days as (
  select generate_series(
    (select start_date_bkk from params),
    (select end_date_bkk from params),
    interval '1 day'
  )::date as biz_date
),
events as (
  select
    timezone('Asia/Bangkok', e.created_at)::date as biz_date,
    count(*) as event_count,
    coalesce(sum(e.deleted_count), 0) as deleted_row_count
  from public.outbound_delete_events e
  cross join params p
  where timezone('Asia/Bangkok', e.created_at)::date between p.start_date_bkk and p.end_date_bkk
  group by timezone('Asia/Bangkok', e.created_at)::date
)
select
  d.biz_date,
  coalesce(e.event_count, 0) as event_count,
  coalesce(e.deleted_row_count, 0) as deleted_row_count
from days d
left join events e on e.biz_date = d.biz_date
order by d.biz_date asc;
