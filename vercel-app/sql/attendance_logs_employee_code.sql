-- attendance_logs: 직원 코드 스냅샷 (이름 변경·레거시 NULL employee_id 보조 매칭)
-- Supabase SQL Editor에서 실행 후 배포. 컬럼 미적용 시 API는 employee_code 없이 동작(폴백).

ALTER TABLE attendance_logs ADD COLUMN IF NOT EXISTS employee_code text;

CREATE INDEX IF NOT EXISTS idx_attendance_logs_employee_code
  ON attendance_logs (employee_code)
  WHERE employee_code IS NOT NULL AND btrim(employee_code) <> '';

-- 1) employee_id 로 연결된 행: employees.employee_code 정규화(영숫자만, 대문자, 최대 5자 — 앱 normalizeEmployeeCodeForMatch 와 동일 취지)
UPDATE attendance_logs al
SET employee_code = LEFT(
  UPPER(REGEXP_REPLACE(TRIM(COALESCE(e.employee_code, '')), '[^A-Za-z0-9]', '', 'g')),
  5
)
FROM employees e
WHERE al.employee_id = e.id
  AND NULLIF(TRIM(COALESCE(e.employee_code, '')), '') IS NOT NULL
  AND (
    al.employee_code IS NULL
    OR BTRIM(al.employee_code) = ''
  );

-- 2) employee_id NULL 인 레거시: 동일 매장·이름 단일 매칭 시 코드만 채움(employee_id 백필은 별도 스크립트 권장)
UPDATE attendance_logs al
SET employee_code = LEFT(
  UPPER(REGEXP_REPLACE(TRIM(COALESCE(e.employee_code, '')), '[^A-Za-z0-9]', '', 'g')),
  5
)
FROM employees e
WHERE al.employee_id IS NULL
  AND LOWER(TRIM(COALESCE(al.store_name, ''))) = LOWER(TRIM(COALESCE(e.store::text, '')))
  AND LOWER(TRIM(COALESCE(al.name, ''))) = LOWER(TRIM(COALESCE(e.name::text, '')))
  AND NULLIF(TRIM(COALESCE(e.employee_code, '')), '') IS NOT NULL
  AND (
    al.employee_code IS NULL
    OR BTRIM(al.employee_code) = ''
  );
