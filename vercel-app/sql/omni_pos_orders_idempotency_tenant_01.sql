-- Omni만. 주문 멱등 키를 (법인, 해시)로 바꿉니다.
-- 같은 로컬 주문번호를 다른 법인이 써도 저장이 막히거나 상대 주문으로 처리되지 않습니다.
-- 충만 DB에는 실행하지 마세요.

DO $$
BEGIN
  IF to_regclass('public.pos_orders') IS NULL THEN
    RAISE EXCEPTION 'public.pos_orders 가 없습니다';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pos_orders'
      AND column_name = 'tenant_id'
  ) THEN
    RAISE EXCEPTION 'public.pos_orders.tenant_id 가 없습니다';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'pos_orders'
      AND column_name = 'idempotency_key_hash'
  ) THEN
    RAISE EXCEPTION 'public.pos_orders.idempotency_key_hash 가 없습니다';
  END IF;

  CREATE UNIQUE INDEX IF NOT EXISTS ux_pos_orders_tenant_idempotency_key_hash
    ON public.pos_orders (coalesce(tenant_id, ''), idempotency_key_hash)
    WHERE idempotency_key_hash IS NOT NULL;

  DROP INDEX IF EXISTS public.ux_pos_orders_idempotency_key_hash;
END $$;
