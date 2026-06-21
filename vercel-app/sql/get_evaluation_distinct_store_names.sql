-- 평가 이력·등급 UI 매장 콤보: DB에 저장된 store_name 전부 (직원 테이블과 철자가 달라도 표시)
-- Supabase SQL Editor에서 실행 후 API /api/getEvaluationDistinctStores 가 채워짐

CREATE OR REPLACE FUNCTION public.get_evaluation_distinct_store_names()
RETURNS TABLE (store_name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT TRIM(er.store_name)::text AS store_name
  FROM public.evaluation_results er
  WHERE er.store_name IS NOT NULL AND TRIM(er.store_name) <> ''
  ORDER BY 1;
$$;

COMMENT ON FUNCTION public.get_evaluation_distinct_store_names() IS
  'evaluation_results 에 존재하는 매장명 목록 (평가 목록 필터용)';

REVOKE ALL ON FUNCTION public.get_evaluation_distinct_store_names() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_evaluation_distinct_store_names() TO service_role;
