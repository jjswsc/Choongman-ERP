-- 기말(또는 지정일) GL 계정 잔액 — journal_lines 누적 (시산표 당월 발생과 구분)
-- Supabase SQL Editor에 붙여넣기 후 vercel-app에서 supabaseRpc('get_gl_balance_as_of', ...) 호출

CREATE OR REPLACE FUNCTION public.get_gl_balance_as_of(
  p_end_date DATE,
  p_store_filter TEXT DEFAULT 'All',
  p_account_codes TEXT[] DEFAULT ARRAY['1010', '1130', '2110']
)
RETURNS TABLE (
  account_code TEXT,
  debit_total NUMERIC,
  credit_total NUMERIC,
  balance NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  WITH filtered_entries AS (
    SELECT je.id
    FROM public.journal_entries je
    WHERE je.accounting_date <= p_end_date
      AND (
        COALESCE(NULLIF(trim(p_store_filter), ''), 'All') IN ('All', '*')
        OR je.store_name IS NULL
        OR trim(je.store_name) = ''
        OR je.store_name ILIKE '%' || trim(p_store_filter) || '%'
        OR trim(p_store_filter) ILIKE '%' || trim(je.store_name) || '%'
      )
  ),
  line_agg AS (
    SELECT
      jl.account_code,
      COALESCE(SUM(CASE WHEN lower(jl.side) = 'debit' THEN jl.amount ELSE 0 END), 0) AS debit_total,
      COALESCE(SUM(CASE WHEN lower(jl.side) = 'credit' THEN jl.amount ELSE 0 END), 0) AS credit_total
    FROM public.journal_lines jl
    INNER JOIN filtered_entries fe ON fe.id = jl.journal_entry_id
    WHERE jl.account_code = ANY (COALESCE(p_account_codes, ARRAY['1010', '1130', '2110']))
    GROUP BY jl.account_code
  )
  SELECT
    a.code AS account_code,
    COALESCE(l.debit_total, 0) AS debit_total,
    COALESCE(l.credit_total, 0) AS credit_total,
    CASE
      WHEN a.code IN ('2110', '2180') THEN COALESCE(l.credit_total, 0) - COALESCE(l.debit_total, 0)
      ELSE COALESCE(l.debit_total, 0) - COALESCE(l.credit_total, 0)
    END AS balance
  FROM unnest(COALESCE(p_account_codes, ARRAY['1010', '1130', '2110'])) AS a(code)
  LEFT JOIN line_agg l ON l.account_code = a.code;
$$;

COMMENT ON FUNCTION public.get_gl_balance_as_of(DATE, TEXT, TEXT[]) IS
  '기말 GL 잔액: 1130/2110/1010 등. balance는 자산=차-대, 부채=대-차.';
