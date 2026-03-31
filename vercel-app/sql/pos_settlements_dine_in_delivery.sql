-- POS 결산: 매장 홀에서 "배달앱" 탭·Dine in 채널 금액 (플랫폼 배달앱과 분리)
alter table public.pos_settlements
  add column if not exists dine_in_delivery_amt numeric(12, 2) default 0;

alter table public.pos_settlements
  add column if not exists dine_in_delivery_breakdown jsonb default '{}'::jsonb;

update public.pos_settlements
set dine_in_delivery_amt = 0
where dine_in_delivery_amt is null;

update public.pos_settlements
set dine_in_delivery_breakdown = '{}'::jsonb
where dine_in_delivery_breakdown is null;
