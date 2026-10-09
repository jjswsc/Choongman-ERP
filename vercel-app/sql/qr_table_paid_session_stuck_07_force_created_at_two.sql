-- ④가 안 먹었을 때만: 해당 2건 created_at -7h + 결과 반환
UPDATE public.pos_orders o
SET
  created_at = o.created_at - interval '7 hours',
  updated_at = now()
WHERE o.id IN (119352, 117949)
  AND o.created_by LIKE 'qr_table:%'
  AND o.paid_at IS NOT NULL
  AND o.created_at > o.paid_at + interval '5 hours'
  AND o.created_at < o.paid_at + interval '9 hours'
RETURNING
  o.id,
  o.order_no,
  o.created_at,
  o.paid_at;
