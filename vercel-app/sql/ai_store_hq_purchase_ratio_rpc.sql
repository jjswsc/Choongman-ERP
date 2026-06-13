-- AI Center: 매출 대비 본사매입 (참고)
-- 실집계는 lib/ai/store-ops-advisor.ts (POS 영업일·출고 단가 규칙과 동일)
-- + GET /api/ai/store-ops
-- 다매장: get_pos_sales_analytics_agg(store) + loadHqOutboundProcessedLines 그룹핑
--
-- 아래 RPC는 Supabase-only 배치/리포트 확장용 placeholder.
-- POS·stock_logs 전체 규칙을 SQL로 이식하기 전까지는 TS advisor를 사용하세요.

CREATE OR REPLACE FUNCTION get_ai_store_hq_purchase_ratio(
  p_start date,
  p_end date,
  p_store text DEFAULT NULL
)
RETURNS TABLE (
  store_name text,
  sales_total numeric,
  hq_outbound_total numeric,
  ratio_pct numeric,
  completed_orders bigint
)
LANGUAGE plpgsql
STABLE
AS $$
BEGIN
  RAISE NOTICE 'Use /api/ai/store-ops or lib/ai/store-ops-advisor.ts for accurate ERP rules';
  RETURN QUERY
  SELECT
    COALESCE(NULLIF(btrim(p_store), ''), 'All')::text,
    0::numeric,
    0::numeric,
    NULL::numeric,
    0::bigint
  WHERE false;
END;
$$;

COMMENT ON FUNCTION get_ai_store_hq_purchase_ratio IS
  'Placeholder — ERP store-ops metrics are computed in TypeScript (posSalesByStore + HQ outbound lines)';
