-- POS 주문: 홀(테이블) 손님 수 (매출 분석 객단가 등)
-- Supabase SQL Editor에서 실행
--
-- 이 컬럼이 없으면 PostgREST select/insert 시 오류가 나거나 값이 저장되지 않을 수 있음.
-- 적용 후에도 손님 수가 0이면 order_type이 DB에 dine_in으로 저장되는지(하이픈 dine-in 금지) 확인.

alter table public.pos_orders
  add column if not exists guest_count integer not null default 0;

comment on column public.pos_orders.guest_count is '홀 주문 인원(1~99). 포장/배달 등은 0.';
