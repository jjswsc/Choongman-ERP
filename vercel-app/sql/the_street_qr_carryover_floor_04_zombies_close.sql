-- 4/4 적용 — The Street 좀비 홀 정리 (6·8 라이브 153230/153231 제외)
-- 권장: 심야·POS 종료 후. pos_orders status만 바꾸고 결제 컬럼은 건드리지 않음.
-- A: 전액 입금인데 미마감 → completed + paid_at
-- B: 0원 껍데기(활성 세션 없음) → cancelled
-- C: 7일+ 미결제 잔존 → cancelled
-- 활성 QR 세션이 붙은 주문은 건드리지 않음.

-- A paid_stuck
UPDATE public.pos_orders o
SET
  status = 'completed',
  paid_at = coalesce(o.paid_at, now())
WHERE o.store_code ILIKE '%the street%'
  AND o.id NOT IN (153230, 153231)
  AND lower(replace(coalesce(o.order_type, 'dine_in'), '-', '_')) = 'dine_in'
  AND lower(coalesce(o.status, '')) IN ('pending', 'cooking', 'ready', 'preparing')
  AND o.total::numeric > 0
  AND (
    coalesce(o.payment_qr, 0) + coalesce(o.payment_cash, 0)
    + coalesce(o.payment_card, 0) + coalesce(o.payment_other, 0)
  )::numeric >= o.total::numeric
  AND NOT EXISTS (
    SELECT 1 FROM public.pos_qr_table_sessions s
    WHERE s.pos_order_id = o.id AND s.status IN ('awaiting_entry', 'active')
  );

-- B empty_shell (0원, 세션 없음)
UPDATE public.pos_orders o
SET status = 'cancelled'
WHERE o.store_code ILIKE '%the street%'
  AND o.id NOT IN (153230, 153231)
  AND lower(replace(coalesce(o.order_type, 'dine_in'), '-', '_')) = 'dine_in'
  AND lower(coalesce(o.status, '')) IN ('pending', 'cooking', 'ready', 'preparing')
  AND o.total::numeric = 0
  AND NOT EXISTS (
    SELECT 1 FROM public.pos_qr_table_sessions s
    WHERE s.pos_order_id = o.id AND s.status IN ('awaiting_entry', 'active')
  );

-- C ancient (7일+, 세션 없음, 미결제)
UPDATE public.pos_orders o
SET status = 'cancelled'
WHERE o.store_code ILIKE '%the street%'
  AND o.id NOT IN (153230, 153231)
  AND lower(replace(coalesce(o.order_type, 'dine_in'), '-', '_')) = 'dine_in'
  AND lower(coalesce(o.status, '')) IN ('pending', 'cooking', 'ready', 'preparing')
  AND o.created_at < (now() - interval '7 days')
  AND (
    coalesce(o.payment_qr, 0) + coalesce(o.payment_cash, 0)
    + coalesce(o.payment_card, 0) + coalesce(o.payment_other, 0)
  )::numeric < o.total::numeric
  AND NOT EXISTS (
    SELECT 1 FROM public.pos_qr_table_sessions s
    WHERE s.pos_order_id = o.id AND s.status IN ('awaiting_entry', 'active')
  );

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('the_street_qr_carryover_floor_04_zombies_close.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
