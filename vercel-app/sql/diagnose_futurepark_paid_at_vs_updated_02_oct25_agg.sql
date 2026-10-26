-- 2/2 조회만 — Future Park 25일 오픈·결제완료 건: paid_at 비어 있음 / 달력일 어긋남 집계
-- SELECT만. 데이터 변경 없음.

SELECT
  COUNT(*) AS paid_orders_opened_oct25,
  COUNT(*) FILTER (WHERE o.paid_at IS NULL) AS paid_at_null,
  COUNT(*) FILTER (
    WHERE o.paid_at IS NOT NULL
      AND (o.paid_at AT TIME ZONE 'Asia/Bangkok')::date
        > (o.created_at AT TIME ZONE 'Asia/Bangkok')::date
  ) AS paid_at_next_calendar_day,
  COUNT(*) FILTER (
    WHERE o.paid_at IS NULL
      AND (o.updated_at AT TIME ZONE 'Asia/Bangkok')::date
        > (o.created_at AT TIME ZONE 'Asia/Bangkok')::date
  ) AS null_paid_updated_next_day,
  ROUND(SUM(COALESCE(o.total, 0))::numeric, 2) AS total_amt,
  ROUND(
    SUM(COALESCE(o.total, 0)) FILTER (
      WHERE o.paid_at IS NULL
        AND (o.updated_at AT TIME ZONE 'Asia/Bangkok')::date
          > (o.created_at AT TIME ZONE 'Asia/Bangkok')::date
    )::numeric,
    2
  ) AS amt_null_paid_updated_next_day
FROM public.pos_orders o
WHERE o.store_code ILIKE '%Future Park%'
  AND (o.created_at AT TIME ZONE 'Asia/Bangkok')::date = DATE '2026-10-25'
  AND LOWER(COALESCE(o.status, '')) IN ('paid', 'completed')
  AND (
    COALESCE(o.payment_cash, 0)
    + COALESCE(o.payment_card, 0)
    + COALESCE(o.payment_qr, 0)
    + COALESCE(o.payment_other, 0)
    + COALESCE(o.payment_delivery_app, 0)
    + COALESCE(o.payment_crypto, 0)
  ) > 0.005;
