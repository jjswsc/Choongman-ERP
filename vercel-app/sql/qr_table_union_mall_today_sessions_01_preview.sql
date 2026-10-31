-- Preview: CM Union Mall QR sessions today (Bangkok calendar day)
-- Use when staff report scan-fail shortly after open (not max_open expiry).

SELECT
  s.id,
  s.table_name,
  s.status,
  s.guest_count,
  s.entry_paid,
  s.entry_payment_mode_resolved,
  s.pos_order_id,
  s.token_id,
  s.opened_by,
  s.created_at,
  s.closed_at,
  s.updated_at,
  o.status AS order_status,
  o.table_name AS order_table_name
FROM public.pos_qr_table_sessions s
LEFT JOIN public.pos_orders o ON o.id = s.pos_order_id
WHERE lower(trim(s.store_code)) = 'cm union mall'
  AND s.created_at::timestamp >= (timezone('Asia/Bangkok', now())::date)::timestamp
  AND s.created_at::timestamp < (timezone('Asia/Bangkok', now())::date + 1)::timestamp
ORDER BY s.id DESC
LIMIT 100;
