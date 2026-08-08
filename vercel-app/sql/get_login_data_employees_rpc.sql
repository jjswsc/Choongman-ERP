-- 로그인용 employees 최소 컬럼 JSON 집계 (PostgREST full scan 대신 DB 내부 처리)
-- Supabase SQL Editor에서 1회 실행. 미배포 시 앱은 REST fallback 유지.
-- 퇴사일(방콕 기준 오늘 이하)이 지난·당일 직원은 로그인 이름 목록에서 제외.
-- soft-delete(deleted_at)는 앱 레이어에서도 제외하며, 삭제는 보통 resign_date도 함께 채움.

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
  has_deleted_at boolean;
  today_bkk date;
  result jsonb;
  sql text;
BEGIN
  today_bkk := (timezone('Asia/Bangkok', now()))::date;

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

  SELECT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'employees'
      AND column_name = 'deleted_at'
  ) INTO has_deleted_at;

  sql := format(
    $q$
    SELECT coalesce(
      jsonb_agg(
        jsonb_build_object(
          'company', %s,
          'store', store,
          'name', name,
          'nick', %s,
          'job', job,
          'role', role,
          'resign_date', resign_date
        )
        ORDER BY id
      ),
      '[]'::jsonb
    )
    FROM employees
    WHERE (resign_date IS NULL OR resign_date::date > $1)
      %s
    $q$,
    CASE WHEN has_company THEN 'company' ELSE 'NULL' END,
    CASE WHEN has_nick THEN 'nick' ELSE 'NULL' END,
    CASE WHEN has_deleted_at THEN 'AND deleted_at IS NULL' ELSE '' END
  );

  EXECUTE sql INTO result USING today_bkk;

  RETURN coalesce(result, '[]'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION public.get_employees_for_login() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_employees_for_login() TO service_role;
