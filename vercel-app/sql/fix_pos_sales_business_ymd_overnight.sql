-- 매출 요일 필터 누락 수정: 심야 넘김(end<start) 영업일을 달력일이 아니라
-- [D@start, (D+1)@end) 로 둔다. getPosBusinessDateStrFromConfig 와 동일.
-- 영업 중 POS 주문 UPDATE 없음. Supabase SQL Editor에서 이것만 복사 → Run.

CREATE OR REPLACE FUNCTION public.pos_sales_business_ymd_from_clock(
  p_created_at timestamptz,
  p_start_hour int,
  p_start_minute int,
  p_end_hour int,
  p_end_minute int
)
RETURNS date
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = public
AS $$
  SELECT CASE
    WHEN (coalesce(p_end_hour, 8) * 60 + coalesce(p_end_minute, 0))
       >= (coalesce(p_start_hour, 8) * 60 + coalesce(p_start_minute, 0))
      THEN (
        timezone('Asia/Bangkok', p_created_at)
        - make_interval(
            hours => coalesce(p_start_hour, 8),
            mins => coalesce(p_start_minute, 0)
          )
      )::date
    WHEN (
      extract(hour FROM timezone('Asia/Bangkok', p_created_at))::int * 60
      + extract(minute FROM timezone('Asia/Bangkok', p_created_at))::int
    ) >= (coalesce(p_start_hour, 8) * 60 + coalesce(p_start_minute, 0))
      THEN timezone('Asia/Bangkok', p_created_at)::date
    WHEN (
      extract(hour FROM timezone('Asia/Bangkok', p_created_at))::int * 60
      + extract(minute FROM timezone('Asia/Bangkok', p_created_at))::int
    ) < (coalesce(p_end_hour, 8) * 60 + coalesce(p_end_minute, 0))
      THEN timezone('Asia/Bangkok', p_created_at)::date - 1
    ELSE timezone('Asia/Bangkok', p_created_at)::date
  END;
$$;

GRANT EXECUTE ON FUNCTION public.pos_sales_business_ymd_from_clock(timestamptz, int, int, int, int) TO anon, authenticated, service_role;
