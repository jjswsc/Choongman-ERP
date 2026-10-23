-- 3/4 조회 — The Street 열린 홀 좀비 분류 (변경 없음)
-- A paid_stuck: 금액 전액 payment_qr 등인데 status 미마감
-- B empty_shell: 0원 QR 껍데기 (활성 세션 없음)
-- C ancient: 7일 이전 미결제 잔존 (6·8 라이브 제외)

WITH open_orders AS (
  SELECT
    o.id,
    o.order_no,
    o.table_name,
    o.status,
    o.total::numeric AS total,
    (coalesce(o.payment_qr, 0) + coalesce(o.payment_cash, 0)
      + coalesce(o.payment_card, 0) + coalesce(o.payment_other, 0))::numeric AS paid_sum,
    o.created_by,
    o.created_at,
    o.paid_at,
    EXISTS (
      SELECT 1
      FROM public.pos_qr_table_sessions s
      WHERE s.pos_order_id = o.id
        AND s.status IN ('awaiting_entry', 'active')
    ) AS has_active_session
  FROM public.pos_orders o
  WHERE o.store_code ILIKE '%the street%'
    AND lower(replace(coalesce(o.order_type, 'dine_in'), '-', '_')) = 'dine_in'
    AND lower(coalesce(o.status, '')) IN ('pending', 'cooking', 'ready', 'preparing')
)
SELECT
  CASE
    WHEN total > 0 AND paid_sum >= total AND paid_at IS NULL THEN 'A_paid_stuck'
    WHEN total = 0 AND NOT has_active_session THEN 'B_empty_shell'
    WHEN created_at < (now() - interval '7 days') AND id NOT IN (153230, 153231) THEN 'C_ancient'
    WHEN has_active_session THEN 'KEEP_live_qr'
    ELSE 'KEEP_review'
  END AS bucket,
  id,
  order_no,
  table_name,
  status,
  total,
  paid_sum,
  has_active_session,
  created_by,
  created_at
FROM open_orders
ORDER BY bucket, table_name, id;
