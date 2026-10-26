-- 1/1 조회만 — 같은 10건: 테이블·결제수단·LinkPOS·QR 메타 (지연 확정 여부)
-- SELECT만. 데이터 변경 없음.

SELECT
  o.order_no,
  o.table_name,
  o.order_type,
  o.status,
  o.created_at AT TIME ZONE 'Asia/Bangkok' AS created_bkk,
  o.paid_at AT TIME ZONE 'Asia/Bangkok' AS paid_bkk,
  o.linkpos_responded_at AT TIME ZONE 'Asia/Bangkok' AS linkpos_bkk,
  o.linkpos_approval_code,
  o.linkpos_response_code,
  ROUND(COALESCE(o.payment_cash, 0)::numeric, 2) AS cash,
  ROUND(COALESCE(o.payment_qr, 0)::numeric, 2) AS qr,
  ROUND(COALESCE(o.payment_card, 0)::numeric, 2) AS card
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
ORDER BY o.paid_at;
