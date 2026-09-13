-- 6/6 재고 합계 RPC — 소프트삭제(is_deleted) 행 제외
-- 화면 재고 목록이 삭제된 출고를 계속 빼던 원인. 앱 재배포 없이 RPC만으로 반영.
-- 존재하는 시그니처(2인자/3인자)만 교체. 이것만 복사 → Run.

DO $$
DECLARE
  has2 boolean;
  has3 boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_store_stock'
      AND p.pronargs = 2
  ) INTO has2;
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'get_store_stock'
      AND p.pronargs = 3
  ) INTO has3;

  IF has2 OR (NOT has2 AND NOT has3) THEN
    EXECUTE $fn2$
CREATE OR REPLACE FUNCTION public.get_store_stock(
  p_location_patterns text[],
  p_as_of_date timestamptz DEFAULT NULL
)
RETURNS TABLE(item_code text, total_qty numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $body$
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
    AND (sl.is_deleted IS NULL OR sl.is_deleted = false)
  GROUP BY sl.item_code;
$body$;
    $fn2$;
  END IF;

  IF has3 THEN
    EXECUTE $fn3$
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
AS $body$
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
    AND (sl.is_deleted IS NULL OR sl.is_deleted = false)
  GROUP BY sl.item_code;
$body$;
    $fn3$;
  END IF;
END $$;
