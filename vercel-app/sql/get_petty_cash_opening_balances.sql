-- Petty cash 기초잔액(조회 시작일 이전 합계) — MonthDetail/List balance_after용
-- Supabase SQL Editor에서 1회 실행. 미배포 시 API가 store,amount 페이징 합산 fallback.
-- get_petty_cash_summary.sql 과 동일 store/Office 매칭 규칙.

CREATE OR REPLACE FUNCTION public.get_petty_cash_opening_balances(
  p_before_date date,
  p_effective_store text DEFAULT NULL,
  p_department_filter text DEFAULT NULL
)
RETURNS TABLE (
  store text,
  opening_balance numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    btrim(t.store) AS store,
    COALESCE(SUM(t.amount), 0)::numeric AS opening_balance
  FROM public.petty_cash_transactions t
  WHERE t.trans_date::date < p_before_date
    AND COALESCE(btrim(t.store), '') <> ''
    AND (
      p_effective_store IS NULL
      OR btrim(p_effective_store) = ''
      OR (
        btrim(p_effective_store) = 'Office'
        AND (
          COALESCE(btrim(p_department_filter), '') = ''
          AND (
            t.store IN ('Office', '본사', '오피스', '본점')
            OR t.store ILIKE 'Office-%'
          )
        )
      )
      OR (
        btrim(p_effective_store) = 'Office'
        AND COALESCE(btrim(p_department_filter), '') <> ''
        AND t.store = ('Office-' || btrim(p_department_filter))
      )
      OR t.store = btrim(p_effective_store)
    )
  GROUP BY btrim(t.store);
$$;

COMMENT ON FUNCTION public.get_petty_cash_opening_balances(date, text, text) IS
  'Petty cash 조회 시작일 이전 매장별 잔액 합. 월별·목록 balance_after 기초잔액.';

REVOKE ALL ON FUNCTION public.get_petty_cash_opening_balances(date, text, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_petty_cash_opening_balances(date, text, text)
  TO service_role;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('get_petty_cash_opening_balances.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
