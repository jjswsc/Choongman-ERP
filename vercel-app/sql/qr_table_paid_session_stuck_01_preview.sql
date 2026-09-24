-- QR 테이블: status=paid 인데 세션이 열려 있거나 payment_qr 합이 부족한 건 미리보기
-- (웹훅이 status=paid만 찍던 버그 잔여분)
SELECT
  o.id AS order_id,
  o.order_no,
  o.store_code,
  o.table_name,
  o.status,
  o.total,
  o.payment_qr,
  o.payment_cash,
  o.payment_card,
  o.payment_other,
  o.created_by,
  o.created_at,
  o.paid_at,
  s.id AS session_id,
  s.status AS session_status,
  s.pending_bill_amount
FROM public.pos_orders o
LEFT JOIN public.pos_qr_table_sessions s
  ON s.pos_order_id = o.id
 AND s.status IN ('awaiting_entry', 'active')
WHERE o.created_by LIKE 'qr_table:%'
  AND lower(coalesce(o.status, '')) IN ('paid', 'completed')
  AND (
    s.id IS NOT NULL
    OR (
      coalesce(o.payment_cash, 0)
      + coalesce(o.payment_card, 0)
      + coalesce(o.payment_qr, 0)
      + coalesce(o.payment_other, 0)
    ) + 0.005 < coalesce(o.total, 0)
  )
ORDER BY o.id DESC
LIMIT 100;
