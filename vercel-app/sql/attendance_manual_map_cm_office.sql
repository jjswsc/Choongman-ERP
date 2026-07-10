-- CM Office 스케줄 약칭 → employees.id 수동 매핑
-- Supabase SQL Editor: §1 INSERT 후 §2·§3 APPLY (또는 전체 순서대로 실행)
--
-- 전제: attendance_employee_id_third_pass.sql 로
--   cm_norm_store / cm_norm_name / attendance_employee_manual_map 테이블 존재
--
-- MSKIT 은 직원 nick 과 불일치하는 레거시 약칭 → §4 로 후보 확인 후 §1 에 추가

-- ============================================================
-- §1) 수동 매핑 등록 (9999 없음 — FK 안전)
-- ============================================================
INSERT INTO attendance_employee_manual_map (store_name, raw_name, employee_id, note) VALUES
  ('CM Office', 'KATCH',              1330, 'Katchakorn Seelaruk (Kate)'),
  ('CM Office', 'NAPAT',              1182, 'Napath Jitsiriboon (Path)'),
  ('CM Office', 'CHOSH',              1377, 'Chosita Krutkran (Bew) — 레거시 약칭'),
  ('CM Office', 'Choshita Krutkran',  1377, 'Chosita 철자 변형'),
  ('CM Office', 'Chosita Krutkran',  1377, '마스터 정식명'),
  ('CM Office', 'Daw',                1383, 'Tuddaw Tubburee'),
  ('CM Office', 'Namphueng',          1380, 'Jutharat Chuawiset'),
  ('CM Office', 'Neenny',             1382, 'Chayanisa Jirawattananusatn')
  -- MSKIT: §4 후보 확인 뒤 아래 한 줄 주석 해제
  -- , ('CM Office', 'MSKIT',           1177, 'TODO: Kittiya Jay? — 반드시 확인')
ON CONFLICT (cm_norm_store(store_name), cm_norm_name(raw_name))
DO UPDATE SET
  employee_id = EXCLUDED.employee_id,
  active = true,
  note = EXCLUDED.note,
  updated_at = now();

-- ============================================================
-- §2) schedules.employee_id 백필
-- ============================================================
WITH mm AS (
  SELECT
    cm_norm_store(store_name) AS store_key,
    cm_norm_name(raw_name) AS name_key,
    employee_id
  FROM attendance_employee_manual_map
  WHERE active = true
)
UPDATE schedules s
SET employee_id = mm.employee_id
FROM mm
WHERE s.employee_id IS NULL
  AND cm_norm_store(s.store_name) = mm.store_key
  AND cm_norm_name(s.name) = mm.name_key;

-- ============================================================
-- §3) attendance_logs.employee_id 백필
-- ============================================================
WITH mm AS (
  SELECT
    cm_norm_store(store_name) AS store_key,
    cm_norm_name(raw_name) AS name_key,
    employee_id
  FROM attendance_employee_manual_map
  WHERE active = true
)
UPDATE attendance_logs a
SET employee_id = mm.employee_id
FROM mm
WHERE a.employee_id IS NULL
  AND cm_norm_store(a.store_name) = mm.store_key
  AND cm_norm_name(a.name) = mm.name_key;

-- ============================================================
-- §4) MSKIT 후보 특정 — 스케줄 시간 vs 근태 출근 시각 비교
--     (결과 보고 §1 MSKIT 행 employee_id 확정)
-- ============================================================
WITH mskit_days AS (
  SELECT schedule_date, plan_in, plan_out
  FROM schedules
  WHERE cm_norm_store(store_name) = cm_norm_store('CM Office')
    AND cm_norm_name(name) = cm_norm_name('MSKIT')
    AND coalesce(trim(plan_in::text), '') <> ''
  ORDER BY schedule_date DESC
  LIMIT 14
),
candidates AS (
  SELECT id, trim(name) AS name, trim(nick) AS nick, trim(employee_code) AS code
  FROM employees
  WHERE cm_norm_store(store) = cm_norm_store('CM Office')
    AND id NOT IN (1330, 1182, 1377, 1383, 1380, 1382) -- 이미 매핑된 약칭 제외
)
SELECT
  c.id,
  c.name,
  c.nick,
  c.code,
  count(DISTINCT al.id) AS clock_in_hits_on_mskit_days
FROM candidates c
LEFT JOIN attendance_logs al
  ON al.employee_id = c.id
 AND trim(coalesce(al.log_type, '')) = '출근'
 AND cm_norm_store(al.store_name) = cm_norm_store('CM Office')
 AND (al.log_at AT TIME ZONE 'Asia/Bangkok')::date IN (SELECT schedule_date FROM mskit_days)
GROUP BY c.id, c.name, c.nick, c.code
ORDER BY clock_in_hits_on_mskit_days DESC, c.nick;

-- ============================================================
-- §5) 적용 후 검증
-- ============================================================
SELECT count(*) AS schedules_still_unresolved_cm_office
FROM schedules
WHERE cm_norm_store(store_name) = cm_norm_store('CM Office')
  AND employee_id IS NULL;

SELECT
  trim(store_name) AS store_name,
  trim(name) AS name,
  count(*) AS rows
FROM schedules
WHERE cm_norm_store(store_name) = cm_norm_store('CM Office')
  AND employee_id IS NULL
GROUP BY 1, 2
ORDER BY rows DESC;

-- 7/7 빨간 행 3명 스케줄 유무
SELECT schedule_date, trim(name) AS name, plan_in, plan_out, employee_id
FROM schedules
WHERE cm_norm_store(store_name) = cm_norm_store('CM Office')
  AND schedule_date = '2026-07-07'
  AND (
    cm_norm_name(name) IN (
      cm_norm_name('Daw'),
      cm_norm_name('Namphueng'),
      cm_norm_name('Neenny'),
      cm_norm_name('Tuddaw Tubburee'),
      cm_norm_name('Jutharat Chuawiset'),
      cm_norm_name('Chayanisa Jirawattananusatn')
    )
    OR employee_id IN (1383, 1380, 1382)
  )
ORDER BY name;
