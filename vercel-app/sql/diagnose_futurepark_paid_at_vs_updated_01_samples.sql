-- 1/2 조회만 — Future Park 화면 샘플(25일 오픈·26일 결제일시로 보인 건)
-- SELECT만. 데이터 변경 없음.
-- 목적: paid_at 실값 vs updated_at(표시 폴백) 중 무엇이 26일인지 확인

SELECT
  o.order_no,
  o.status,
  o.total,
  ROUND(COALESCE(o.payment_cash, 0)::numeric, 2) AS cash,
  ROUND(COALESCE(o.payment_qr, 0)::numeric, 2) AS qr,
  ROUND(COALESCE(o.payment_card, 0)::numeric, 2) AS card,
  o.paid_at IS NULL AS paid_at_null,
  o.created_at AT TIME ZONE 'Asia/Bangkok' AS created_bkk,
  o.paid_at AT TIME ZONE 'Asia/Bangkok' AS paid_bkk,
  o.updated_at AT TIME ZONE 'Asia/Bangkok' AS updated_bkk,
  ROUND(
    EXTRACT(EPOCH FROM (COALESCE(o.paid_at, o.updated_at) - o.created_at)) / 3600.0,
    1
  ) AS hours_created_to_display_paid
FROM public.pos_orders o
WHERE o.store_code ILIKE '%Future Park%'
  AND o.order_no IN (
    'CMFUTUREPARK-20261025-067',
    'CMFUTUREPARK-20261025-064',
    'CMFUTUREPARK-20261025-061',
    'CMFUTUREPARK-20261025-070',
    'CMFUTUREPARK-20261025-057',
    'CMFUTUREPARK-20261025-066',
    'CMFUTUREPARK-20261025-073',
    'CMFUTUREPARK-20261025-022',
    'CMFUTUREPARK-20261025-054',
    'CMFUTUREPARK-20261025-060'
  )
ORDER BY o.order_no;
