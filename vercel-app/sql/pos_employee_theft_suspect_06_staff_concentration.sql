-- 매장 POS 횡령 의심 — 6/6 직원별 몰림 (조회 전용)
-- 같은 사람이 결제 후 취소·미결제 취소를 반복하면 점수가 올라갑니다.
-- created_by 는 로그인 이름이 비어 있으면 기기명일 수 있습니다.
-- 감사로그(pos_order_audit_logs)가 있는 기간만 취소 실행자가 더 정확합니다.

WITH params AS (
  SELECT
    ((timezone('Asia/Bangkok', now()))::date - 90) AS start_ymd,
    (timezone('Asia/Bangkok', now()))::date AS end_ymd,
    NULL::text AS store_code
),
orders_in_range AS (
  SELECT
    o.id,
    btrim(coalesce(o.store_code, '')) AS store_code,
    nullif(btrim(coalesce(o.created_by, '')), '') AS created_by,
    lower(btrim(coalesce(o.status, ''))) AS status,
    lower(btrim(coalesce(o.order_type, ''))) AS order_type,
    coalesce(o.total, 0)::numeric AS total,
    coalesce(o.payment_cash, 0)::numeric AS payment_cash,
    (
      coalesce(o.payment_cash, 0)
      + coalesce(o.payment_card, 0)
      + coalesce(o.payment_qr, 0)
      + coalesce(o.payment_other, 0)
      + coalesce(o.payment_delivery_app, 0)
    )::numeric AS payment_sum,
    o.paid_at,
    coalesce(o.memo, '') AS memo,
    coalesce(o.delivery_app_code, '') AS delivery_app_code
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
    AND coalesce(o.memo, '') !~ '\[ORDER_MERGED\s'
),
cancel_actor AS (
  SELECT DISTINCT ON (a.order_id)
    a.order_id,
    nullif(btrim(coalesce(a.changed_by_employee_code, '')), '') AS employee_code,
    nullif(btrim(coalesce(a.changed_by, '')), '') AS changed_by,
    a.reason
  FROM public.pos_order_audit_logs a
  CROSS JOIN params p
  WHERE a.changed_at >= (p.start_ymd::text || 'T00:00:00+07:00')::timestamptz
    AND a.changed_at < ((p.end_ymd + 1)::text || 'T00:00:00+07:00')::timestamptz
    AND a.action_type = 'update_status'
    AND lower(coalesce(a.after_json->>'status', '')) IN ('cancelled', 'canceled', 'refunded')
  ORDER BY a.order_id, a.changed_at DESC
),
joined AS (
  SELECT
    o.store_code,
    coalesce(c.employee_code, c.changed_by, o.created_by, '(unknown)') AS staff_key,
    o.status,
    o.order_type,
    o.total,
    o.payment_cash,
    o.payment_sum,
    o.paid_at,
    o.delivery_app_code,
    (o.paid_at IS NOT NULL OR o.payment_sum > 0.5) AS had_payment,
    (o.delivery_app_code <> '' OR o.order_type IN ('delivery', 'grab', 'lineman', 'shopee')) AS is_app
  FROM orders_in_range o
  LEFT JOIN cancel_actor c ON c.order_id = o.id
  WHERE o.status IN ('cancelled', 'canceled', 'refunded')
)
SELECT
  store_code,
  staff_key,
  count(*) FILTER (WHERE had_payment AND NOT is_app) AS paid_then_cancel_cnt,
  round(sum(total) FILTER (WHERE had_payment AND NOT is_app)::numeric, 2) AS paid_then_cancel_amt,
  count(*) FILTER (WHERE had_payment AND payment_cash > 0.5 AND NOT is_app) AS cash_paid_then_cancel_cnt,
  round(sum(payment_cash) FILTER (WHERE had_payment AND payment_cash > 0.5 AND NOT is_app)::numeric, 2) AS cash_paid_then_cancel_amt,
  count(*) FILTER (WHERE NOT had_payment AND NOT is_app) AS unpaid_cancel_cnt,
  round(sum(total) FILTER (WHERE NOT had_payment AND NOT is_app)::numeric, 2) AS unpaid_cancel_amt
FROM joined
GROUP BY store_code, staff_key
HAVING
  count(*) FILTER (WHERE had_payment AND NOT is_app) >= 3
  OR round(sum(payment_cash) FILTER (WHERE had_payment AND payment_cash > 0.5 AND NOT is_app)::numeric, 2) >= 1000
  OR count(*) FILTER (WHERE NOT had_payment AND NOT is_app) >= 8
ORDER BY
  cash_paid_then_cancel_amt DESC NULLS LAST,
  paid_then_cancel_cnt DESC,
  unpaid_cancel_amt DESC NULLS LAST
LIMIT 200;
