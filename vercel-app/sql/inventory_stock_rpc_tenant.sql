-- Omni SaaS: 재고 RPC에 p_tenant_id 추가 (stock_logs.tenant_id 필터)
-- stock_logs.tenant_id 는 inventory_tenant_id.sql 선행 필요.

DROP FUNCTION IF EXISTS public.get_store_stock(text[], timestamptz);
DROP FUNCTION IF EXISTS public.get_store_stock(text[], timestamptz, text);
DROP FUNCTION IF EXISTS public.get_distinct_stock_locations();
DROP FUNCTION IF EXISTS public.get_distinct_stock_locations(text);

CREATE OR REPLACE FUNCTION public.get_store_stock(
  p_location_patterns text[],
  p_as_of_date timestamptz DEFAULT NULL,
  p_tenant_id text DEFAULT NULL
)
RETURNS TABLE(item_code text, total_qty numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT sl.item_code::text, SUM(sl.qty)::numeric
  FROM public.stock_logs sl
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
    AND (
      coalesce(trim(p_tenant_id), '') = ''
      OR coalesce(trim(sl.tenant_id), '') = trim(p_tenant_id)
    )
  GROUP BY sl.item_code;
$$;

CREATE OR REPLACE FUNCTION public.get_distinct_stock_locations(
  p_tenant_id text DEFAULT NULL
)
RETURNS TABLE(location text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT sl.location::text
  FROM public.stock_logs sl
  WHERE sl.location IS NOT NULL
    AND btrim(sl.location) <> ''
    AND (
      coalesce(trim(p_tenant_id), '') = ''
      OR coalesce(trim(sl.tenant_id), '') = trim(p_tenant_id)
    );
$$;

COMMENT ON FUNCTION public.get_store_stock(text[], timestamptz, text) IS
  '매장별 재고 합계. Omni는 p_tenant_id 로 stock_logs 격리.';

COMMENT ON FUNCTION public.get_distinct_stock_locations(text) IS
  '재고 location 목록. Omni는 p_tenant_id 로 stock_logs 격리.';

GRANT EXECUTE ON FUNCTION public.get_store_stock(text[], timestamptz, text) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_distinct_stock_locations(text) TO anon, authenticated, service_role;
