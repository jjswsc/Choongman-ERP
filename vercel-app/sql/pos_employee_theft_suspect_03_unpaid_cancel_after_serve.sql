-- 매장 POS 횡령 의심 — 3/6 미결제 홀·포장 취소 (조회 전용)
-- 주방/홀에 나간 뒤 결제를 안 찍고 취소하는 패턴.
-- 서빙 시각이 있거나, 주문 후 8분 이상 지나 취소됐거나, 합계 100바트 이상인 건만 봅니다.

WITH params AS (
  SELECT
    ((timezone('Asia/Bangkok', now()))::date - 90) AS start_ymd,
    (timezone('Asia/Bangkok', now()))::date AS end_ymd,
    NULL::text AS store_code
),
src AS (
  SELECT
    o.id,
    o.order_no,
    o.store_code,
    o.order_type,
    o.status,
    o.created_by,
    o.table_name,
    o.created_at,
    o.updated_at,
    o.total,
    o.memo,
    coalesce(o.items_json::text, '') AS items_text,
    CASE
      WHEN coalesce(o.memo, '') ~ '\[ORDER_CANCELLED\s+[0-9T:\.\+\-Z]+'
        THEN (regexp_match(o.memo, '\[ORDER_CANCELLED\s+([0-9T:\.\+\-Z]+)'))[1]::timestamptz
      ELSE o.updated_at
    END AS cancelled_at_guess
  FROM public.pos_orders o
  CROSS JOIN params p
  WHERE o.created_at >= (p.start_ymd::text || 'T00:00:00+07:00')::timestamptz
    AND o.created_at < ((p.end_ymd + 1)::text || 'T00:00:00+07:00')::timestamptz
    AND (
      p.store_code IS NULL
      OR btrim(p.store_code) = ''
      OR btrim(coalesce(o.store_code, '')) = btrim(p.store_code)
    )
    AND btrim(coalesce(o.store_code, '')) !~* '(office|본사|^hq$)'
    AND lower(btrim(coalesce(o.status, ''))) IN ('cancelled', 'canceled')
    AND coalesce(o.memo, '') !~ '\[ORDER_MERGED\s'
    AND coalesce(o.delivery_app_code, '') = ''
    AND lower(btrim(coalesce(o.order_type, ''))) NOT IN ('delivery', 'grab', 'lineman', 'shopee')
    AND o.paid_at IS NULL
    AND (
      coalesce(o.payment_cash, 0)
      + coalesce(o.payment_card, 0)
      + coalesce(o.payment_qr, 0)
      + coalesce(o.payment_other, 0)
      + coalesce(o.payment_delivery_app, 0)
    ) <= 0.5
)
SELECT
  s.id,
  s.order_no,
  s.store_code,
  s.order_type,
  s.table_name,
  s.created_by,
  (timezone('Asia/Bangkok', s.created_at)) AS created_bkk,
  (timezone('Asia/Bangkok', s.cancelled_at_guess)) AS cancelled_bkk,
  round(extract(epoch FROM (s.cancelled_at_guess - s.created_at)) / 60.0, 1) AS minutes_open,
  round(coalesce(s.total, 0)::numeric, 2) AS total,
  (s.items_text LIKE '%servedAt%' OR s.items_text LIKE '%served_at%') AS had_served,
  (s.items_text LIKE '%cancelledAt%' OR s.items_text LIKE '%cancelled_at%') AS had_line_cancel,
  left(coalesce(s.memo, ''), 240) AS memo_head
FROM src s
WHERE coalesce(s.total, 0) >= 100
  AND (
    s.items_text LIKE '%servedAt%'
    OR s.items_text LIKE '%served_at%'
    OR extract(epoch FROM (s.cancelled_at_guess - s.created_at)) >= 480
  )
ORDER BY
  coalesce(s.total, 0) DESC,
  s.created_at DESC
LIMIT 300;
