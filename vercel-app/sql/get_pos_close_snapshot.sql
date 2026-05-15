-- POS close snapshot RPC.

create or replace function public.get_pos_close_snapshot(
  p_store_code text,
  p_settle_date date
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
      and (o.created_at at time zone 'Asia/Bangkok')::date = p_settle_date
      and lower(coalesce(o.status, '')) in ('paid', 'preparing', 'cooking', 'ready', 'completed')
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
