-- 영업 중·POS 켜진 상태 실행 금지
-- paid/completed QR 주문에 연결된 열린 세션 종료
UPDATE public.pos_qr_table_sessions s
SET
  status = 'closed',
  closed_at = now(),
  pending_bill_partner_txn_id = null,
  pending_bill_amount = 0,
  updated_at = now()
FROM public.pos_orders o
WHERE s.pos_order_id = o.id
  AND o.created_by LIKE 'qr_table:%'
  AND lower(coalesce(o.status, '')) IN ('paid', 'completed')
  AND s.status IN ('awaiting_entry', 'active');
