-- 기말(지정일) GL 계정 잔액 — 분개 매장명(store_name)별 차변·대변 합계
-- 매장 매칭·잔액 부호는 앱(lib/gl-balance-as-of.ts)이 select 폴백과 같은 기준으로 처리한다.
-- 미배포 시 재무상태표·원장 대사가 분개 헤더 전체를 읽어 JS로 합산 → 대량 분개에서 타임아웃.
-- 조회 전용 함수 생성 — 데이터 변경 없음, 영업 중 실행 가능.

CREATE OR REPLACE FUNCTION public.get_gl_balance_by_store_as_of(
  p_end_date DATE,
  p_account_codes TEXT[]
)
RETURNS TABLE (
  store_name TEXT,
  account_code TEXT,
  debit_total NUMERIC,
  credit_total NUMERIC
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    COALESCE(je.store_name, '')::TEXT AS store_name,
    trim(jl.account_code)::TEXT AS account_code,
    COALESCE(SUM(ABS(jl.amount)) FILTER (WHERE lower(jl.side) = 'debit'), 0)::NUMERIC AS debit_total,
    COALESCE(SUM(ABS(jl.amount)) FILTER (WHERE lower(jl.side) = 'credit'), 0)::NUMERIC AS credit_total
  FROM public.journal_lines jl
  INNER JOIN public.journal_entries je ON je.id = jl.journal_entry_id
  WHERE je.accounting_date <= p_end_date
    AND jl.account_code = ANY (p_account_codes)
  GROUP BY 1, 2;
$$;

COMMENT ON FUNCTION public.get_gl_balance_by_store_as_of(DATE, TEXT[]) IS
  '기말 GL 잔액(매장명별 차·대 합계). 매장 필터·부호는 앱에서 적용.';

GRANT EXECUTE ON FUNCTION public.get_gl_balance_by_store_as_of(DATE, TEXT[]) TO service_role;

NOTIFY pgrst, 'reload schema';

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('get_gl_balance_by_store_as_of.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
