-- 직원 평가 집계 RPC (Supabase SQL Editor에서 실행)
-- 파라미터: 기간(date), 유형(all|kitchen|service), 매장(빈 문자열이면 전체)

CREATE OR REPLACE FUNCTION public.eval_json_total_score(data text)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  j jsonb;
  s text;
BEGIN
  IF data IS NULL OR btrim(data) = '' THEN
    RETURN NULL;
  END IF;
  BEGIN
    j := data::jsonb;
  EXCEPTION WHEN OTHERS THEN
    RETURN NULL;
  END;
  s := j->>'totalScore';
  IF s IS NULL OR btrim(s) = '' THEN
    RETURN NULL;
  END IF;
  IF s ~ '^-?[0-9]+(\.[0-9]+)?$' THEN
    RETURN s::numeric;
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_evaluation_analytics(
  p_start date,
  p_end date,
  p_eval_type text DEFAULT 'all',
  p_store_name text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE sql
STABLE
AS $$
WITH base AS (
  SELECT
    eval_type,
    eval_date::date AS d,
    btrim(store_name) AS store_name,
    btrim(employee_name) AS employee_name,
    nullif(btrim(final_grade), '') AS final_grade,
    btrim(coalesce(evaluator, '')) AS evaluator,
    eval_json_total_score(
      CASE
        WHEN json_data IS NULL THEN NULL::text
        ELSE json_data::text
      END
    ) AS total_score
  FROM evaluation_results
  WHERE eval_date::date >= p_start
    AND eval_date::date <= p_end
    AND (
      p_eval_type IS NULL
      OR btrim(lower(p_eval_type)) IN ('all', '')
      OR eval_type = lower(btrim(p_eval_type))
    )
    AND (
      p_store_name IS NULL
      OR btrim(p_store_name) = ''
      OR btrim(store_name) = btrim(p_store_name)
    )
),
summary AS (
  SELECT
    count(*)::int AS total_evaluations,
    count(DISTINCT (store_name, employee_name))::int AS unique_employees,
    round(avg(total_score)::numeric, 4) AS avg_total_score
  FROM base
),
grades AS (
  SELECT final_grade AS g, count(*)::int AS c
  FROM base
  WHERE final_grade IS NOT NULL
  GROUP BY final_grade
),
by_store AS (
  SELECT
    store_name,
    count(*)::int AS evaluations,
    count(DISTINCT employee_name)::int AS unique_employees,
    round(avg(total_score)::numeric, 4) AS avg_score
  FROM base
  GROUP BY store_name
),
by_type AS (
  SELECT
    eval_type,
    count(*)::int AS evaluations,
    count(DISTINCT (store_name, employee_name))::int AS unique_employees,
    round(avg(total_score)::numeric, 4) AS avg_score
  FROM base
  GROUP BY eval_type
),
by_month AS (
  SELECT
    to_char(date_trunc('month', d::timestamp), 'YYYY-MM') AS ym,
    count(*)::int AS evaluations,
    round(avg(total_score)::numeric, 4) AS avg_score
  FROM base
  GROUP BY 1
  ORDER BY 1
),
by_evaluator AS (
  SELECT
    evaluator,
    count(*)::int AS evaluations,
    round(avg(total_score)::numeric, 4) AS avg_score
  FROM base
  WHERE evaluator <> ''
  GROUP BY evaluator
  ORDER BY count(*) DESC
  LIMIT 30
)
SELECT jsonb_build_object(
  'summary', (
    SELECT jsonb_build_object(
      'totalEvaluations', s.total_evaluations,
      'uniqueEmployees', s.unique_employees,
      'avgTotalScore', s.avg_total_score
    )
    FROM summary s
  ),
  'gradeDistribution', (
    SELECT coalesce(jsonb_object_agg(g, c), '{}'::jsonb)
    FROM grades
  ),
  'byStore', (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'store', store_name,
          'evaluations', evaluations,
          'uniqueEmployees', unique_employees,
          'avgScore', avg_score
        )
        ORDER BY store_name
      ),
      '[]'::jsonb
    )
    FROM by_store
  ),
  'byType', (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'evalType', eval_type,
          'evaluations', evaluations,
          'uniqueEmployees', unique_employees,
          'avgScore', avg_score
        )
        ORDER BY eval_type
      ),
      '[]'::jsonb
    )
    FROM by_type
  ),
  'byMonth', (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'yearMonth', ym,
          'evaluations', evaluations,
          'avgScore', avg_score
        )
        ORDER BY ym
      ),
      '[]'::jsonb
    )
    FROM by_month
  ),
  'byEvaluator', (
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'evaluator', evaluator,
          'evaluations', evaluations,
          'avgScore', avg_score
        )
      ),
      '[]'::jsonb
    )
    FROM by_evaluator
  ),
  'source', 'rpc'
);
$$;

-- API는 service_role로만 호출하는 것을 권장. 필요 시 authenticated 추가.
GRANT EXECUTE ON FUNCTION public.eval_json_total_score(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_evaluation_analytics(date, date, text, text) TO service_role;
