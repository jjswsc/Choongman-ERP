-- 근태 그리드 빨간 행(계획 H=0)·휴게초과 진단
-- Supabase SQL Editor에서 실행. §0 파라미터만 수정하면 됩니다.
--
-- 전제: cm_norm_store / cm_norm_name 함수가 있어야 합니다.
--   없으면 attendance_employee_id_third_pass.sql 의 Helper(§cm_norm_*) 1회 실행.
--
-- 근태 UI 빨간색 의미(vercel-app 기준):
--   · 행 배경 연한 빨강 = 계획(H) 0 이고 정규직(파트타임 아님) → 그날 유효 스케줄 미매칭
--   · 휴게초과(M) 빨강 = 실제 휴게 − 스케줄 휴게 > 0 (스케줄 없으면 휴게 전부 초과)

-- ============================================================
-- 0) 파라미터
-- ============================================================
-- p_store: 근태·스케줄 매장명 (erp_stores 표기와 동일 권장)
-- p_work_date: 근무일 (방콕 달력 YYYY-MM-DD)
-- p_name_patterns: ILIKE 패턴 배열 — 빈 배열이면 해당일 전체 직원

-- ============================================================
-- 1) 해당일 출퇴근 로그 (원본)
-- ============================================================
WITH params AS (
  SELECT
    'CM Office'::text AS p_store,
    '2026-07-07'::date AS p_work_date,
    ARRAY['%daw%', '%namphueng%', '%neenny%']::text[] AS p_name_patterns
),
params_norm AS (
  SELECT p.*, cm_norm_store(p.p_store) AS store_key
  FROM params p
),
day_logs AS (
  SELECT
    al.id,
    al.log_at AT TIME ZONE 'Asia/Bangkok' AS log_at_bkk,
    (al.log_at AT TIME ZONE 'Asia/Bangkok')::date AS log_date_bkk,
    trim(coalesce(al.store_name, '')) AS store_name,
    trim(coalesce(al.name, '')) AS log_name,
    al.employee_id,
    trim(coalesce(al.employee_code, '')) AS employee_code,
    trim(coalesce(al.log_type, '')) AS log_type,
    coalesce(al.break_min, 0)::int AS break_min,
    trim(coalesce(al.status, '')) AS status,
    cm_norm_name(al.name) AS log_name_norm
  FROM public.attendance_logs al
  CROSS JOIN params_norm p
  WHERE cm_norm_store(al.store_name) = p.store_key
    AND (al.log_at AT TIME ZONE 'Asia/Bangkok')::date = p.p_work_date
    AND (
      cardinality(p.p_name_patterns) = 0
      OR EXISTS (
        SELECT 1
        FROM unnest(p.p_name_patterns) pat
        WHERE al.name ILIKE pat
      )
    )
)
SELECT *
FROM day_logs
ORDER BY log_name, log_at_bkk;

-- ============================================================
-- 2) 해당일 schedules 행 (같은 매장·이름 필터)
-- ============================================================
WITH params AS (
  SELECT
    'CM Office'::text AS p_store,
    '2026-07-07'::date AS p_work_date,
    ARRAY['%daw%', '%namphueng%', '%neenny%']::text[] AS p_name_patterns
),
params_norm AS (
  SELECT p.*, cm_norm_store(p.p_store) AS store_key
  FROM params p
)
SELECT
  s.id,
  s.schedule_date,
  trim(coalesce(s.store_name, '')) AS store_name,
  trim(coalesce(s.name, '')) AS schedule_name,
  s.employee_id,
  s.plan_in,
  s.plan_out,
  s.break_start,
  s.break_end,
  coalesce(s.plan_in_prev_day, false) AS plan_in_prev_day,
  trim(coalesce(s.memo, '')) AS memo,
  cm_norm_name(s.name) AS schedule_name_norm,
  CASE
    WHEN coalesce(trim(s.plan_in::text), '') = ''
     AND coalesce(trim(s.plan_out::text), '') = '' THEN '휴무/시간없음'
    ELSE '근무시간있음'
  END AS schedule_kind
FROM public.schedules s
CROSS JOIN params_norm p
WHERE cm_norm_store(s.store_name) = p.store_key
  AND s.schedule_date = p.p_work_date
  AND (
    cardinality(p.p_name_patterns) = 0
    OR EXISTS (
      SELECT 1 FROM unnest(p.p_name_patterns) pat WHERE s.name ILIKE pat
    )
  )
ORDER BY schedule_name;

-- ============================================================
-- 3) 근태 ↔ 스케줄 매칭 진단 (앱 getAttendanceRecordsAdmin 과 동일 취지)
--    · employee_id 우선, 없으면 정규화 이름
--    · plan_in/plan_out 비어 있으면 계획 근무 0 → 빨간 행
-- ============================================================
WITH params AS (
  SELECT
    'CM Office'::text AS p_store,
    '2026-07-07'::date AS p_work_date,
    ARRAY['%daw%', '%namphueng%', '%neenny%']::text[] AS p_name_patterns
),
params_norm AS (
  SELECT p.*, cm_norm_store(p.p_store) AS store_key
  FROM params p
),
-- 당일 출근 로그 기준 1인 1행 (그리드와 유사)
clock_in AS (
  SELECT DISTINCT ON (coalesce(al.employee_id::text, ''), cm_norm_name(al.name))
    trim(coalesce(al.store_name, '')) AS store_name,
    trim(coalesce(al.name, '')) AS log_name,
    al.employee_id,
    cm_norm_name(al.name) AS log_name_norm,
    al.log_at AS in_at
  FROM public.attendance_logs al
  CROSS JOIN params_norm p
  WHERE cm_norm_store(al.store_name) = p.store_key
    AND (al.log_at AT TIME ZONE 'Asia/Bangkok')::date = p.p_work_date
    AND trim(coalesce(al.log_type, '')) = '출근'
    AND (
      cardinality(p.p_name_patterns) = 0
      OR EXISTS (SELECT 1 FROM unnest(p.p_name_patterns) pat WHERE al.name ILIKE pat)
    )
  ORDER BY coalesce(al.employee_id::text, ''), cm_norm_name(al.name), al.log_at
),
break_sum AS (
  SELECT
    ci.store_name,
    ci.log_name,
    ci.employee_id,
    sum(coalesce(al.break_min, 0))::int AS break_min_total
  FROM clock_in ci
  JOIN public.attendance_logs al
    ON cm_norm_store(al.store_name) = cm_norm_store(ci.store_name)
   AND (al.log_at AT TIME ZONE 'Asia/Bangkok')::date = (SELECT p_work_date FROM params)
   AND (
     (ci.employee_id IS NOT NULL AND al.employee_id = ci.employee_id)
     OR (ci.employee_id IS NULL AND cm_norm_name(al.name) = ci.log_name_norm)
   )
  GROUP BY ci.store_name, ci.log_name, ci.employee_id
),
sch_by_id AS (
  SELECT DISTINCT ON (s.employee_id)
    s.*,
    'employee_id'::text AS match_via
  FROM public.schedules s
  CROSS JOIN params_norm p
  WHERE cm_norm_store(s.store_name) = p.store_key
    AND s.schedule_date = p.p_work_date
    AND s.employee_id IS NOT NULL
  ORDER BY s.employee_id, s.id
),
sch_by_name AS (
  SELECT DISTINCT ON (cm_norm_name(s.name))
    s.*,
    'name_norm'::text AS match_via
  FROM public.schedules s
  CROSS JOIN params_norm p
  WHERE cm_norm_store(s.store_name) = p.store_key
    AND s.schedule_date = p.p_work_date
  ORDER BY cm_norm_name(s.name), s.id
),
emp AS (
  SELECT
    e.id,
    trim(coalesce(e.store, '')) AS emp_store,
    trim(coalesce(e.name, '')) AS emp_name,
    trim(coalesce(e.employee_code, '')) AS employee_code,
    trim(coalesce(e.job, '')) AS job,
    trim(coalesce(e.sal_type, '')) AS sal_type,
    cm_norm_name(e.name) AS emp_name_norm
  FROM public.employees e
  CROSS JOIN params_norm p
  WHERE cm_norm_store(e.store) = p.store_key
),
diag AS (
  SELECT
    ci.log_name,
    ci.employee_id AS att_employee_id,
    e.employee_code,
    e.emp_name AS master_name,
    e.job,
    e.sal_type,
    bs.break_min_total,
    coalesce(sid.id, sn.id) AS schedule_row_id,
    coalesce(sid.name, sn.name) AS matched_schedule_name,
    CASE
      WHEN sid.id IS NOT NULL THEN 'employee_id'
      WHEN sn.id IS NOT NULL THEN 'name_norm'
      ELSE NULL
    END AS match_via,
    coalesce(sid.plan_in, sn.plan_in) AS plan_in,
    coalesce(sid.plan_out, sn.plan_out) AS plan_out,
    coalesce(sid.break_start, sn.break_start) AS break_start,
    coalesce(sid.break_end, sn.break_end) AS break_end,
    coalesce(sid.employee_id, sn.employee_id) AS sch_employee_id
  FROM clock_in ci
  LEFT JOIN break_sum bs
    ON bs.log_name = ci.log_name
   AND coalesce(bs.employee_id, -1) = coalesce(ci.employee_id, -1)
  LEFT JOIN sch_by_id sid ON ci.employee_id IS NOT NULL AND sid.employee_id = ci.employee_id
  LEFT JOIN sch_by_name sn
    ON sid.id IS NULL
   AND cm_norm_name(sn.name) = ci.log_name_norm
  LEFT JOIN emp e ON e.id = ci.employee_id
)
SELECT
  d.log_name,
  d.employee_code,
  d.att_employee_id,
  d.master_name,
  d.match_via,
  d.schedule_row_id,
  d.matched_schedule_name,
  d.sch_employee_id,
  d.plan_in,
  d.plan_out,
  d.break_start,
  d.break_end,
  d.break_min_total,
  CASE
    WHEN d.schedule_row_id IS NULL THEN '스케줄 행 없음 → 계획 0 · 빨간 행'
    WHEN coalesce(trim(d.plan_in::text), '') = ''
     AND coalesce(trim(d.plan_out::text), '') = '' THEN '휴무(시간 없음) → 계획 0 · 빨간 행'
    WHEN d.att_employee_id IS NOT NULL AND d.sch_employee_id IS NULL THEN '스케줄에 employee_id 없음 — 이름 매칭만 가능'
    WHEN d.att_employee_id IS NOT NULL AND d.sch_employee_id IS NOT NULL
     AND d.att_employee_id <> d.sch_employee_id THEN 'employee_id 불일치 — ID 매칭 실패'
    WHEN d.master_name IS NOT NULL AND cm_norm_name(d.log_name) <> cm_norm_name(d.master_name) THEN '근태 이름 ≠ 마스터 이름 (표시명 차이)'
    ELSE '스케줄 매칭됨 — 계획>0 이면 정상 행'
  END AS diagnosis,
  CASE
    WHEN d.schedule_row_id IS NULL THEN d.break_min_total
    WHEN coalesce(
      (regexp_match(trim(coalesce(d.break_end::text, '')), '(\d{1,2})[:\s](\d{1,2})'))[1]::int * 60
      + (regexp_match(trim(coalesce(d.break_end::text, '')), '(\d{1,2})[:\s](\d{1,2})'))[2]::int,
      0
    ) > coalesce(
      (regexp_match(trim(coalesce(d.break_start::text, '')), '(\d{1,2})[:\s](\d{1,2})'))[1]::int * 60
      + (regexp_match(trim(coalesce(d.break_start::text, '')), '(\d{1,2})[:\s](\d{1,2})'))[2]::int,
      0
    )
    THEN greatest(
      0,
      d.break_min_total
      - (
        coalesce(
          (regexp_match(trim(coalesce(d.break_end::text, '')), '(\d{1,2})[:\s](\d{1,2})'))[1]::int * 60
          + (regexp_match(trim(coalesce(d.break_end::text, '')), '(\d{1,2})[:\s](\d{1,2})'))[2]::int,
          0
        )
        - coalesce(
          (regexp_match(trim(coalesce(d.break_start::text, '')), '(\d{1,2})[:\s](\d{1,2})'))[1]::int * 60
          + (regexp_match(trim(coalesce(d.break_start::text, '')), '(\d{1,2})[:\s](\d{1,2})'))[2]::int,
          0
        )
      )
    )
    ELSE d.break_min_total
  END AS break_over_min_est,
  CASE
    WHEN d.sal_type ~* 'part|시급|hourly' OR d.job ~* 'part|파트' THEN '파트타임 → 계획 0이어도 빨간 행 아님'
    ELSE '정규직'
  END AS part_time_flag
FROM diag d
ORDER BY d.log_name;

-- ============================================================
-- 4) 해당일 CM Office — 계획 0(빨간 행) 후보 전체
--    (§3과 동일 로직, 이름 필터 없음)
-- ============================================================
WITH params AS (
  SELECT 'CM Office'::text AS p_store, '2026-07-07'::date AS p_work_date
),
params_norm AS (
  SELECT p.*, cm_norm_store(p.p_store) AS store_key FROM params p
),
clock_in AS (
  SELECT DISTINCT ON (coalesce(al.employee_id::text, ''), cm_norm_name(al.name))
    trim(coalesce(al.name, '')) AS log_name,
    al.employee_id,
    cm_norm_name(al.name) AS log_name_norm
  FROM public.attendance_logs al
  CROSS JOIN params_norm p
  WHERE cm_norm_store(al.store_name) = p.store_key
    AND (al.log_at AT TIME ZONE 'Asia/Bangkok')::date = p.p_work_date
    AND trim(coalesce(al.log_type, '')) = '출근'
  ORDER BY coalesce(al.employee_id::text, ''), cm_norm_name(al.name), al.log_at
),
sch_by_id AS (
  SELECT DISTINCT ON (s.employee_id) s.employee_id, s.plan_in, s.plan_out
  FROM public.schedules s
  CROSS JOIN params_norm p
  WHERE cm_norm_store(s.store_name) = p.store_key AND s.schedule_date = p.p_work_date
    AND s.employee_id IS NOT NULL
  ORDER BY s.employee_id, s.id
),
sch_by_name AS (
  SELECT DISTINCT ON (cm_norm_name(s.name))
    cm_norm_name(s.name) AS name_norm, s.plan_in, s.plan_out
  FROM public.schedules s
  CROSS JOIN params_norm p
  WHERE cm_norm_store(s.store_name) = p.store_key AND s.schedule_date = p.p_work_date
  ORDER BY cm_norm_name(s.name), s.id
),
joined AS (
  SELECT
    ci.log_name,
    ci.employee_id,
    coalesce(sid.plan_in, sn.plan_in) AS plan_in,
    coalesce(sid.plan_out, sn.plan_out) AS plan_out,
    CASE WHEN sid.employee_id IS NOT NULL OR sn.name_norm IS NOT NULL THEN true ELSE false END AS has_schedule_row
  FROM clock_in ci
  LEFT JOIN sch_by_id sid ON ci.employee_id IS NOT NULL AND sid.employee_id = ci.employee_id
  LEFT JOIN sch_by_name sn ON sid.employee_id IS NULL AND sn.name_norm = ci.log_name_norm
)
SELECT
  log_name,
  employee_id,
  has_schedule_row,
  plan_in,
  plan_out,
  CASE
    WHEN NOT has_schedule_row THEN '스케줄 없음'
    WHEN coalesce(trim(plan_in::text), '') = '' AND coalesce(trim(plan_out::text), '') = '' THEN '휴무'
    ELSE 'OK'
  END AS reason
FROM joined
WHERE NOT has_schedule_row
   OR (coalesce(trim(plan_in::text), '') = '' AND coalesce(trim(plan_out::text), '') = '')
ORDER BY log_name;

-- ============================================================
-- 5) 주간 스케줄 요약 (7/6~7/12) — Daw / Namphueng / Neenny
--    근태는 7/7만 보지만 시간표 탭은 주간이라 요일별 휴무 확인용
-- ============================================================
WITH params AS (
  SELECT
    'CM Office'::text AS p_store,
    '2026-07-06'::date AS week_start,
    '2026-07-12'::date AS week_end,
    ARRAY['%daw%', '%namphueng%', '%neenny%']::text[] AS p_name_patterns
),
params_norm AS (
  SELECT p.*, cm_norm_store(p.p_store) AS store_key FROM params p
)
SELECT
  s.schedule_date,
  to_char(s.schedule_date, 'Dy') AS dow,
  trim(s.name) AS schedule_name,
  s.employee_id,
  s.plan_in,
  s.plan_out,
  s.break_start,
  s.break_end,
  CASE
    WHEN coalesce(trim(s.plan_in::text), '') = ''
     AND coalesce(trim(s.plan_out::text), '') = '' THEN '휴무'
    ELSE trim(coalesce(s.plan_in::text, '')) || '-' || trim(coalesce(s.plan_out::text, ''))
  END AS work_slot
FROM public.schedules s
CROSS JOIN params_norm p
WHERE cm_norm_store(s.store_name) = p.store_key
  AND s.schedule_date BETWEEN p.week_start AND p.week_end
  AND EXISTS (SELECT 1 FROM unnest(p.p_name_patterns) pat WHERE s.name ILIKE pat)
ORDER BY s.name, s.schedule_date;

-- ============================================================
-- 6) employee_id 미연결 건수 (스케줄·근태 각각)
-- ============================================================
WITH params AS (
  SELECT 'CM Office'::text AS p_store, '2026-07-07'::date AS p_work_date
),
params_norm AS (
  SELECT p.*, cm_norm_store(p.p_store) AS store_key FROM params p
)
SELECT 'schedules' AS src, count(*)::int AS rows_missing_employee_id
FROM public.schedules s
CROSS JOIN params_norm p
WHERE cm_norm_store(s.store_name) = p.store_key
  AND s.schedule_date = p.p_work_date
  AND s.employee_id IS NULL
  AND (
    coalesce(trim(s.plan_in::text), '') <> '' OR coalesce(trim(s.plan_out::text), '') <> ''
  )
UNION ALL
SELECT 'attendance_logs', count(*)::int
FROM public.attendance_logs al
CROSS JOIN params_norm p
WHERE cm_norm_store(al.store_name) = p.store_key
  AND (al.log_at AT TIME ZONE 'Asia/Bangkok')::date = p.p_work_date
  AND al.employee_id IS NULL;
