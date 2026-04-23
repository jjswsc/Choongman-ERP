-- 물류 KPI 대시보드용 쿼리 세트
-- 기본 기간: 최근 30일 (방콕 기준)

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
