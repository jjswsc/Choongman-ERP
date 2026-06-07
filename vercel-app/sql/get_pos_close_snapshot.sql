-- POS close snapshot RPC — 영업일 UTC 구간 기준 (결산·getPosSettlement과 동일)
-- p_start_utc / p_end_utc_exclusive 가 있으면 해당 구간, 없으면 달력일 폴백(하위 호환)

create or replace function public.get_pos_close_snapshot(
  p_store_code text,
  p_settle_date date,
  p_start_utc timestamptz default null,
  p_end_utc_exclusive timestamptz default null
)
returns table (
  store_code text,
  business_date date,
  system_total numeric,
  settlement_total numeric,
  diff_total numeric,
  has_settlement boolean,
  close_status text
)
language sql
stable
as $$
  with system_rows as (
    select
      coalesce(sum(o.total), 0)::numeric as system_total
    from public.pos_orders o
    where o.store_code = p_store_code
      and lower(coalesce(o.status, '')) in ('paid', 'ready', 'completed')
      and (
        (
          p_start_utc is not null
          and p_end_utc_exclusive is not null
          and o.created_at >= p_start_utc
          and o.created_at < p_end_utc_exclusive
        )
        or (
          p_start_utc is null
          and p_end_utc_exclusive is null
          and (o.created_at at time zone 'Asia/Bangkok')::date = p_settle_date
        )
      )
  ),
  settlement_rows as (
    select
      (coalesce(s.cash_amt, 0) + coalesce(s.card_amt, 0) + coalesce(s.qr_amt, 0) +
       coalesce(s.delivery_app_amt, 0) + coalesce(s.dine_in_delivery_amt, 0) + coalesce(s.other_amt, 0))::numeric as settlement_total,
      case when coalesce(s.closed, false) then 'locked' else 'draft' end as close_status
    from public.pos_settlements s
    where s.store_code = p_store_code
      and (s.settle_date)::date = p_settle_date
    limit 1
  )
  select
    p_store_code,
    p_settle_date,
    sy.system_total,
    coalesce(se.settlement_total, 0)::numeric as settlement_total,
    (sy.system_total - coalesce(se.settlement_total, 0))::numeric as diff_total,
    (se.settlement_total is not null) as has_settlement,
    coalesce(se.close_status, 'draft') as close_status
  from system_rows sy
  left join settlement_rows se on true;
$$;
