-- QR 세션만 닫는다. pos_orders 는 수정하지 않는다 (결제 영수증 재인쇄 없음).
-- 이미 결제·완료된 주문에 붙은 더스트리트 세션만 대상.
UPDATE public.pos_qr_table_sessions s
SET
  status = 'closed',
  closed_at = now(),
  pending_bill_partner_txn_id = null,
  pending_bill_amount = 0,
  updated_at = now()
FROM public.pos_orders o
WHERE s.pos_order_id = o.id
  AND s.status IN ('awaiting_entry', 'active')
  AND lower(coalesce(o.status, '')) IN ('paid', 'completed')
  AND (
    s.store_code ILIKE '%the street%'
    OR s.store_code = '1050'
  );
