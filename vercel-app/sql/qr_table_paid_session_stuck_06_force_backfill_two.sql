-- ②가 안 먹었을 때만: 해당 order_id만 payment_qr 백필 + 결과 반환
UPDATE public.pos_orders o
SET
  payment_qr = round(
    (
      coalesce(o.payment_qr, 0)
      + greatest(
          0,
          coalesce(o.total, 0)
          - (
              coalesce(o.payment_cash, 0)
              + coalesce(o.payment_card, 0)
              + coalesce(o.payment_qr, 0)
              + coalesce(o.payment_other, 0)
            )
        )
    )::numeric,
    2
  ),
  updated_at = now()
WHERE o.id IN (119352, 117949)
  AND o.created_by LIKE 'qr_table:%'
  AND lower(coalesce(o.status, '')) IN ('paid', 'completed')
RETURNING
  o.id,
  o.order_no,
  o.total,
  o.payment_qr,
  o.updated_at;
