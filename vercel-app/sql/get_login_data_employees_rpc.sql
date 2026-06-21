-- 로그인용 employees 최소 컬럼 JSON 집계 (PostgREST full scan 대신 DB 내부 처리)
-- Supabase SQL Editor에서 1회 실행. 미배포 시 앱은 REST fallback 유지.

CREATE OR REPLACE FUNCTION public.get_employees_for_login()
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_company boolean;
  has_nick boolean;
  result jsonb;
BEGIN
  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'company'
  ) INTO has_company;

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'nick'
  ) INTO has_nick;

  IF has_company AND has_nick THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'company', company,
          'store', store,
          'name', name,
          'nick', nick,
          'job', job,
          'role', role,
          'resign_date', resign_date
        )
        ORDER BY id
      ),
      '[]'::jsonb
    )
    INTO result
    FROM employees;
  ELSIF has_company AND NOT has_nick THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'company', company,
          'store', store,
          'name', name,
          'nick', NULL,
          'job', job,
          'role', role,
          'resign_date', resign_date
        )
        ORDER BY id
      ),
      '[]'::jsonb
    )
    INTO result
    FROM employees;
  ELSIF NOT has_company AND has_nick THEN
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'company', NULL,
          'store', store,
          'name', name,
          'nick', nick,
          'job', job,
          'role', role,
          'resign_date', resign_date
        )
        ORDER BY id
      ),
      '[]'::jsonb
    )
    INTO result
    FROM employees;
  ELSE
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'company', NULL,
          'store', store,
          'name', name,
          'nick', NULL,
          'job', job,
          'role', role,
          'resign_date', resign_date
        )
        ORDER BY id
      ),
      '[]'::jsonb
    )
    INTO result
    FROM employees;
  END IF;

  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_employees_for_login() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employees_for_login() TO service_role;
