-- POS 주문 멱등성 강화를 위한 키 해시 컬럼/유니크 인덱스
-- savePosOrder에서 X-Idempotency-Key 또는 localOrderNo를 sha256 해시로 저장

alter table public.pos_orders
  add column if not exists idempotency_key_hash text null;

-- tenant_id 가 있으면 법인+해시. 없으면(단일 법인 DB) 해시만.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'pos_orders' and column_name = 'tenant_id'
  ) then
    create unique index if not exists ux_pos_orders_tenant_idempotency_key_hash
      on public.pos_orders (coalesce(tenant_id, ''), idempotency_key_hash)
      where idempotency_key_hash is not null;
    drop index if exists public.ux_pos_orders_idempotency_key_hash;
  else
    create unique index if not exists ux_pos_orders_idempotency_key_hash
      on public.pos_orders(idempotency_key_hash)
      where idempotency_key_hash is not null;
  end if;
end $$;
