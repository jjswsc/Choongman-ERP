-- 법인세(PND50/51)용 손익 집계 RPC
-- journal_entries + journal_lines 를 DB에서 합산 (앱 limit 잘림 방지)
-- p_store_names NULL/빈배열 = 전체
-- 분개 0건이어도 revenue/expense/entry_count 1행 반환

CREATE OR REPLACE FUNCTION public.get_corporate_tax_pl_agg(
  p_start_date DATE,
  p_end_date DATE,
  p_store_names TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  revenue NUMERIC,
  expense NUMERIC,
  entry_count BIGINT
)
LANGUAGE sql
STABLE
SET search_path = public
AS $$
WITH entries AS (
  SELECT e.id
  FROM public.journal_entries e
  WHERE e.accounting_date >= p_start_date
    AND e.accounting_date <= p_end_date
    AND (
      p_store_names IS NULL
      OR cardinality(p_store_names) = 0
      OR lower(trim(COALESCE(e.store_name, ''))) = ANY (
        SELECT lower(trim(x)) FROM unnest(p_store_names) AS x WHERE trim(COALESCE(x, '')) <> ''
      )
    )
),
lines AS (
  SELECT
    trim(COALESCE(l.account_code, '')) AS acct_code,
    lower(trim(COALESCE(l.side, ''))) AS line_side,
    ABS(COALESCE(l.amount, 0)::NUMERIC) AS line_amt
  FROM public.journal_lines l
  JOIN entries e ON e.id = l.journal_entry_id
)
SELECT
  ROUND(COALESCE((
    SELECT SUM(
      CASE
        WHEN ln.acct_code LIKE '4%' AND ln.line_side = 'credit' THEN ln.line_amt
        WHEN ln.acct_code LIKE '4%' THEN -ln.line_amt
        ELSE 0
      END
    )
    FROM lines ln
  ), 0), 2) AS revenue,
  ROUND(COALESCE((
    SELECT SUM(
      CASE
        WHEN ln.acct_code LIKE '5%' AND ln.line_side = 'debit' THEN ln.line_amt
        WHEN ln.acct_code LIKE '5%' THEN -ln.line_amt
        ELSE 0
      END
    )
    FROM lines ln
  ), 0), 2) AS expense,
  (SELECT COUNT(*)::BIGINT FROM entries) AS entry_count;
$$;

COMMENT ON FUNCTION public.get_corporate_tax_pl_agg(DATE, DATE, TEXT[]) IS
  '법인세 계산용 분개 손익 집계. store_names 스코프 지원.';

GRANT EXECUTE ON FUNCTION public.get_corporate_tax_pl_agg(DATE, DATE, TEXT[]) TO anon, authenticated, service_role;
