-- pos_orders에 coupon_code 등 회원 로열티 관련 컬럼 추가
-- Supabase SQL Editor에서 실행

alter table public.pos_orders add column if not exists member_id bigint;
alter table public.pos_orders add column if not exists member_no text;
alter table public.pos_orders add column if not exists coupon_code text;
alter table public.pos_orders add column if not exists coupon_discount_amt numeric(14,2) not null default 0;
alter table public.pos_orders add column if not exists point_used integer not null default 0;
alter table public.pos_orders add column if not exists point_earned integer not null default 0;

create index if not exists idx_pos_orders_member_id on public.pos_orders(member_id);
