-- POS 등급 할인 — pos_orders.tier_discount_amt (할인 현황·결제 할인 집계)
alter table public.pos_orders
  add column if not exists tier_discount_amt numeric(14,2) not null default 0;

alter table public.pos_orders
  add column if not exists member_tier_code text;

comment on column public.pos_orders.tier_discount_amt is '회원 등급 자동 할인 금액(결제 할인 층).';
comment on column public.pos_orders.member_tier_code is '주문 시점 회원 등급 코드(BRONZE/SILVER/…).';
