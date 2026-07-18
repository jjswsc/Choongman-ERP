-- 원재료 실제 소진(재고등식) + 분해 집계 RPC
-- 실제소진 = 기초 + 입고(Inbound/ForcePush) − 출고(Outbound/ForceOutbound) − 기말
-- Usage / Adjustment / POS 는 설명 분해용
--
-- stock_logs.tenant_id / is_deleted 가 없는 레거시 DB 에서도 동작 (컬럼 있을 때만 필터).
-- Supabase SQL Editor에 붙여넣기 후 실행.

CREATE OR REPLACE FUNCTION public.get_ingredient_usage_actual(
  p_location_patterns text[],
  p_start timestamptz,
  p_end_exclusive timestamptz,
  p_tenant_id text DEFAULT NULL
)
RETURNS TABLE (
  item_code text,
  beginning_qty numeric,
  ending_qty numeric,
  inbound_qty numeric,
  outbound_qty numeric,
  usage_qty numeric,
  adjustment_qty numeric,
  pos_qty numeric,
  actual_usage_qty numeric,
  has_adjustment boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_tenant boolean;
  has_deleted boolean;
  sql text;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_logs'
      AND column_name = 'tenant_id'
  ) INTO has_tenant;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'stock_logs'
      AND column_name = 'is_deleted'
  ) INTO has_deleted;

  sql := $q$
  WITH loc AS (
    SELECT unnest(COALESCE($1, ARRAY[]::text[])) AS pat
  ),
  scoped AS (
    SELECT
      sl.item_code::text AS item_code,
      sl.qty::numeric AS qty,
      sl.log_type::text AS log_type,
      sl.log_date
    FROM public.stock_logs sl
    WHERE sl.item_code IS NOT NULL
      AND btrim(sl.item_code) <> ''
  $q$;

  IF has_deleted THEN
    sql := sql || $q$
      AND (sl.is_deleted IS NULL OR sl.is_deleted = false)
    $q$;
  END IF;

  IF has_tenant THEN
    sql := sql || $q$
      AND (
        coalesce(trim($4), '') = ''
        OR coalesce(trim(sl.tenant_id), '') = trim($4)
      )
    $q$;
  END IF;

  sql := sql || $q$
      AND EXISTS (
        SELECT 1 FROM loc
        WHERE sl.location ILIKE loc.pat
      )
  ),
  codes AS (
    SELECT DISTINCT s.item_code FROM scoped s
  ),
  beginning AS (
    SELECT s.item_code, SUM(s.qty) AS qty
    FROM scoped s
    WHERE s.log_date < $2
    GROUP BY s.item_code
  ),
  ending AS (
    SELECT s.item_code, SUM(s.qty) AS qty
    FROM scoped s
    WHERE s.log_date < $3
    GROUP BY s.item_code
  ),
  period AS (
    SELECT
      s.item_code,
      SUM(
        CASE
          WHEN s.log_type IN ('Inbound', 'ForcePush') AND s.qty > 0 THEN s.qty
          ELSE 0
        END
      ) AS inbound_qty,
      SUM(
        CASE
          WHEN s.log_type IN ('Outbound', 'ForceOutbound') THEN ABS(s.qty)
          ELSE 0
        END
      ) AS outbound_qty,
      SUM(
        CASE
          WHEN s.log_type = 'Usage' THEN ABS(s.qty)
          ELSE 0
        END
      ) AS usage_qty,
      SUM(
        CASE
          WHEN s.log_type = 'Adjustment' THEN s.qty
          ELSE 0
        END
      ) AS adjustment_qty,
      SUM(
        CASE
          WHEN s.log_type = 'POS' THEN ABS(s.qty)
          WHEN s.log_type = 'POS_REVERSAL' THEN -ABS(s.qty)
          ELSE 0
        END
      ) AS pos_qty,
      BOOL_OR(s.log_type = 'Adjustment') AS has_adjustment
    FROM scoped s
    WHERE s.log_date >= $2
      AND s.log_date < $3
    GROUP BY s.item_code
  )
  SELECT
    c.item_code,
    COALESCE(b.qty, 0)::numeric AS beginning_qty,
    COALESCE(e.qty, 0)::numeric AS ending_qty,
    COALESCE(p.inbound_qty, 0)::numeric AS inbound_qty,
    COALESCE(p.outbound_qty, 0)::numeric AS outbound_qty,
    COALESCE(p.usage_qty, 0)::numeric AS usage_qty,
    COALESCE(p.adjustment_qty, 0)::numeric AS adjustment_qty,
    COALESCE(p.pos_qty, 0)::numeric AS pos_qty,
    (
      COALESCE(b.qty, 0)
      + COALESCE(p.inbound_qty, 0)
      - COALESCE(p.outbound_qty, 0)
      - COALESCE(e.qty, 0)
    )::numeric AS actual_usage_qty,
    COALESCE(p.has_adjustment, false) AS has_adjustment
  FROM codes c
  LEFT JOIN beginning b ON b.item_code = c.item_code
  LEFT JOIN ending e ON e.item_code = c.item_code
  LEFT JOIN period p ON p.item_code = c.item_code
  WHERE
    COALESCE(b.qty, 0) <> 0
    OR COALESCE(e.qty, 0) <> 0
    OR COALESCE(p.inbound_qty, 0) <> 0
    OR COALESCE(p.outbound_qty, 0) <> 0
    OR COALESCE(p.usage_qty, 0) <> 0
    OR COALESCE(p.adjustment_qty, 0) <> 0
    OR COALESCE(p.pos_qty, 0) <> 0
  $q$;

  RETURN QUERY EXECUTE sql
    USING p_location_patterns, p_start, p_end_exclusive, p_tenant_id;
END;
$$;

COMMENT ON FUNCTION public.get_ingredient_usage_actual(text[], timestamptz, timestamptz, text) IS
  '매장 원재료 실제 소진(기초+입고-출고-기말) 및 Usage/Adjustment/POS 분해. tenant_id/is_deleted 없으면 해당 필터 생략.';

GRANT EXECUTE ON FUNCTION public.get_ingredient_usage_actual(text[], timestamptz, timestamptz, text)
  TO anon, authenticated, service_role;
