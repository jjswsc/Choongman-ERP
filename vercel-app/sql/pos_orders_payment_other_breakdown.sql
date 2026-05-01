-- POS 주문: 기타(payment_other) 세부 분해(JSON). payment_other 합과 클라이언트에서 일치 검증.
alter table public.pos_orders
  add column if not exists payment_other_breakdown jsonb null;

comment on column public.pos_orders.payment_other_breakdown is
  'Breakdown of payment_other (TrueMoney, WeChat, admin wallets, etc.). Sum must match payment_other.';
