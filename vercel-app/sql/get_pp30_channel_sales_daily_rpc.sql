-- PP30 채널별 일별 매출 DB 집계 RPC
-- 대규모: getPp30ChannelSales 가 주문 전량 select 대신 이 RPC를 우선 사용
-- p_store_codes NULL/빈배열 = 전체 매장

CREATE OR REPLACE FUNCTION public.get_pp30_channel_sales_daily(
  p_start_date DATE,
  p_end_date DATE,
  p_store_codes TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  business_date TEXT,
  cash NUMERIC,
  card NUMERIC,
  qr NUMERIC,
  delivery_app NUMERIC,
  other_amt NUMERIC,
  total_amt NUMERIC,
  order_count BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH scoped AS (
  SELECT
    to_char((COALESCE(o.paid_at, o.created_at) AT TIME ZONE 'Asia/Bangkok')::date, 'YYYY-MM-DD') AS biz_date,
    GREATEST(COALESCE(o.payment_cash, 0), 0)::NUMERIC AS cash_amt,
    GREATEST(COALESCE(o.payment_card, 0), 0)::NUMERIC AS card_amt,
    GREATEST(COALESCE(o.payment_qr, 0), 0)::NUMERIC AS qr_amt,
    GREATEST(COALESCE(o.payment_delivery_app, 0), 0)::NUMERIC AS delivery_amt,
    GREATEST(COALESCE(o.total, 0), 0)::NUMERIC AS total_row
  FROM public.pos_orders o
  WHERE lower(COALESCE(o.status, '')) IN ('completed', 'paid')
    AND COALESCE(o.paid_at, o.created_at) >= (p_start_date::timestamp AT TIME ZONE 'Asia/Bangkok')
    AND COALESCE(o.paid_at, o.created_at) < (((p_end_date + 1)::timestamp) AT TIME ZONE 'Asia/Bangkok')
    AND (
      p_store_codes IS NULL
      OR cardinality(p_store_codes) = 0
      OR trim(COALESCE(o.store_code, '')) = ANY (p_store_codes)
    )
),
calc AS (
  SELECT
    biz_date,
    cash_amt,
    card_amt,
    qr_amt,
    delivery_amt,
    GREATEST(total_row - cash_amt - card_amt - qr_amt - delivery_amt, 0)::NUMERIC AS other_calc,
    total_row
  FROM scoped
  WHERE biz_date IS NOT NULL AND biz_date <> ''
)
SELECT
  biz_date AS business_date,
  ROUND(SUM(cash_amt), 2) AS cash,
  ROUND(SUM(card_amt), 2) AS card,
  ROUND(SUM(qr_amt), 2) AS qr,
  ROUND(SUM(delivery_amt), 2) AS delivery_app,
  ROUND(SUM(other_calc), 2) AS other_amt,
  ROUND(SUM(total_row), 2) AS total_amt,
  COUNT(*)::BIGINT AS order_count
FROM calc
GROUP BY biz_date
ORDER BY biz_date;
$$;

COMMENT ON FUNCTION public.get_pp30_channel_sales_daily(DATE, DATE, TEXT[]) IS
  'PP30 매출 조정용 채널별 일별 집계. store_codes 스코프 지원.';

GRANT EXECUTE ON FUNCTION public.get_pp30_channel_sales_daily(DATE, DATE, TEXT[]) TO anon, authenticated, service_role;
