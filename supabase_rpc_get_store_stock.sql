-- 재고 합계를 DB 집계로 조회 (limit 없음, 품목별 SUM만 반환)
-- Supabase 대시보드 > SQL Editor 에서 실행

CREATE OR REPLACE FUNCTION get_store_stock(
  p_location_patterns text[],
  p_as_of_date timestamptz DEFAULT NULL
)
RETURNS TABLE(item_code text, total_qty numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sl.item_code::text, SUM(sl.qty)::numeric
  FROM stock_logs sl
  WHERE
    (p_as_of_date IS NULL OR sl.log_date <= p_as_of_date)
    AND (
      p_location_patterns IS NULL
      OR cardinality(p_location_patterns) = 0
      OR EXISTS (
        SELECT 1 FROM unnest(p_location_patterns) AS pat
        WHERE sl.location ILIKE pat
      )
    )
  GROUP BY sl.item_code;
$$;

COMMENT ON FUNCTION get_store_stock(text[], timestamptz) IS '매장별 재고 합계 조회. location ILIKE 매칭. p_as_of_date 는 포함 상한(<=): 앱에서 방콕 해당일 말일 끝 UTC(getBangkokEndOfDayUtcIso)로 전달 권장';

-- 재고 현황용 매장 목록 (stock_logs의 DISTINCT location) - limit 없음
CREATE OR REPLACE FUNCTION get_distinct_stock_locations()
RETURNS TABLE(location text)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT DISTINCT sl.location::text
  FROM stock_logs sl
  WHERE sl.location IS NOT NULL AND trim(sl.location) <> '';
$$;

COMMENT ON FUNCTION get_distinct_stock_locations() IS '재고 로그에 등장하는 매장(location) 목록';

-- 미수금/미지급금 잔액 요약 (DB 집계) - limit 없음
CREATE OR REPLACE FUNCTION get_receivable_summary(
  p_store_filter text DEFAULT NULL,
  p_end_str text DEFAULT NULL
)
RETURNS TABLE(store_name text, balance numeric, item_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    r.store_name::text,
    SUM(r.amount)::numeric AS balance,
    COUNT(*)::bigint AS item_count
  FROM receivable_transactions r
  WHERE
    (p_store_filter IS NULL OR p_store_filter = '' OR r.store_name ILIKE p_store_filter)
    AND (p_end_str IS NULL OR p_end_str = '' OR r.trans_date::date <= p_end_str::date)
  GROUP BY r.store_name;
$$;

CREATE OR REPLACE FUNCTION get_payable_summary(
  p_vendor_filter text DEFAULT NULL,
  p_end_str text DEFAULT NULL
)
RETURNS TABLE(vendor_code text, balance numeric, item_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT
    p.vendor_code::text,
    SUM(p.amount)::numeric AS balance,
    COUNT(*)::bigint AS item_count
  FROM payable_transactions p
  WHERE
    (p_vendor_filter IS NULL OR p_vendor_filter = '' OR p.vendor_code ILIKE p_vendor_filter)
    AND (p_end_str IS NULL OR p_end_str = '' OR p.trans_date::date <= p_end_str::date)
  GROUP BY p.vendor_code;
$$;

COMMENT ON FUNCTION get_receivable_summary(text, text) IS '미수금 store별 잔액 요약';
COMMENT ON FUNCTION get_payable_summary(text, text) IS '미지급금 vendor별 잔액 요약';
