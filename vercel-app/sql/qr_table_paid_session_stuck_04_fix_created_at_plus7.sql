-- created_at 이 방콕 naive 문자열로 timestamptz에 들어가 +7h로 보이던 QR 주문 보정
-- (ISO 저장 배포 이전분). paid_at 이 있고 created_at 이 paid_at 보다 ~6~8시간 늦은 건만.
UPDATE public.pos_orders o
SET created_at = o.created_at - interval '7 hours',
    updated_at = now()
WHERE o.created_by LIKE 'qr_table:%'
  AND o.paid_at IS NOT NULL
  AND o.created_at > o.paid_at + interval '5 hours'
  AND o.created_at < o.paid_at + interval '9 hours'
  AND o.created_at::date >= (timezone('Asia/Bangkok', now())::date - 3);
