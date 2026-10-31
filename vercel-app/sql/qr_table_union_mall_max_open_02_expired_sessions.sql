-- Preview only: recent Union Mall QR sessions that expired (last 3 Bangkok days)
-- Compare age minutes vs store max_open_minutes from query 01.

SELECT
  s.id,
  s.store_code,
  s.table_name,
  s.status,
  s.created_at,
  s.closed_at,
  s.guest_count,
  s.pos_order_id,
  ROUND(
    EXTRACT(
      EPOCH FROM (
        COALESCE(s.closed_at::timestamp, now()) - s.created_at::timestamp
      )
    ) / 60.0
  )::int AS open_age_minutes
FROM public.pos_qr_table_sessions s
WHERE lower(trim(s.store_code)) IN (
  'cm union mall',
  '1047',
  'union mall'
)
  AND s.status = 'expired'
  AND s.created_at::timestamp >= (timezone('Asia/Bangkok', now())::date - 3)::timestamp
ORDER BY s.id DESC
LIMIT 100;
