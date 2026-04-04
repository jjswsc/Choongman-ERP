-- POS 주문 멱등성 강화를 위한 키 해시 컬럼/유니크 인덱스
-- savePosOrder에서 X-Idempotency-Key 또는 localOrderNo를 sha256 해시로 저장

alter table public.pos_orders
  add column if not exists idempotency_key_hash text null;

create unique index if not exists ux_pos_orders_idempotency_key_hash
  on public.pos_orders(idempotency_key_hash)
  where idempotency_key_hash is not null;
