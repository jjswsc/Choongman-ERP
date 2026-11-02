-- POS 메뉴 삭제 가드: 주문 items_json 에 해당 menu id 가 있으면 true
-- 앱 `/api/deletePosMenu` 가 RPC 우선 호출, 미배포 시 LIKE 폴백.
-- 이것만 복사 → Supabase SQL Editor에서 Run.

CREATE OR REPLACE FUNCTION public.pos_menu_has_order_usage(p_menu_id bigint)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.pos_orders o
    CROSS JOIN LATERAL jsonb_array_elements(
      CASE
        WHEN o.items_json IS NULL OR btrim(o.items_json::text) IN ('', 'null') THEN '[]'::jsonb
        WHEN left(btrim(o.items_json::text), 1) = '[' THEN
          CASE
            WHEN jsonb_typeof(o.items_json::jsonb) = 'array' THEN o.items_json::jsonb
            ELSE '[]'::jsonb
          END
        ELSE '[]'::jsonb
      END
    ) AS e
    WHERE
      o.items_json LIKE ('%' || p_menu_id::text || '%')
      AND (
        nullif(btrim(coalesce(
          e->>'menuId1', e->>'menuId', e->>'menu_id1', e->>'menu_id', ''
        )), '') = p_menu_id::text
        OR nullif(btrim(coalesce(e->>'menuId2', e->>'menu_id2', '')), '') = p_menu_id::text
      )
  );
$$;

COMMENT ON FUNCTION public.pos_menu_has_order_usage(bigint) IS
  'True if any pos_orders.items_json line references the given pos_menus.id (delete guard).';

GRANT EXECUTE ON FUNCTION public.pos_menu_has_order_usage(bigint) TO anon, authenticated, service_role;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_menu_has_order_usage_01_rpc.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
