-- 물류 무결성 점검 배치 쿼리 세트
-- 운영 반영 후 스케줄러(cron/pg_cron/외부 배치)에서 주기 실행 권장
-- 시간 기준: Asia/Bangkok

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
