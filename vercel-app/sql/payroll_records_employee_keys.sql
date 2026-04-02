-- payroll_records 직원 식별 키 확장 (employee_id / employee_code)
-- 목적: 동명이인 충돌 방지, 급여 집계·저장·개인조회 정합성 향상

ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES employees (id) ON DELETE SET NULL;
ALTER TABLE payroll_records ADD COLUMN IF NOT EXISTS employee_code text;

CREATE INDEX IF NOT EXISTS idx_payroll_records_employee_id ON payroll_records (employee_id);

-- 직원코드 포맷 정규화(옵션)
UPDATE payroll_records
SET employee_code = upper(left(regexp_replace(trim(coalesce(employee_code, '')), '[^A-Za-z0-9]', '', 'g'), 5))
WHERE employee_code IS NOT NULL;

-- 이름+매장 기반 기존 데이터 백필 (동명이인 가능 시 id.asc 1건 사용)
-- UPDATE ... FROM LATERAL에서 타깃 별칭 참조 오류를 피하기 위해 CTE로 매칭 후 업데이트
WITH matched AS (
  SELECT
    pr.ctid AS pr_tid,
    e.id AS emp_id,
    e.employee_code AS emp_code,
    row_number() OVER (PARTITION BY pr.ctid ORDER BY e.id ASC) AS rn
  FROM payroll_records pr
  JOIN employees e
    ON lower(trim(e.store::text)) = lower(trim(pr.store::text))
   AND lower(trim(e.name::text)) = lower(trim(pr.name::text))
  WHERE pr.employee_id IS NULL
)
UPDATE payroll_records pr
SET
  employee_id = m.emp_id,
  employee_code = COALESCE(
    NULLIF(upper(left(regexp_replace(trim(coalesce(pr.employee_code, '')), '[^A-Za-z0-9]', '', 'g'), 5)), ''),
    NULLIF(upper(left(regexp_replace(trim(coalesce(m.emp_code, '')), '[^A-Za-z0-9]', '', 'g'), 5)), '')
  )
FROM matched m
WHERE pr.ctid = m.pr_tid
  AND m.rn = 1;

-- employee_id가 있으면 월+매장+직원ID 1건 보장
CREATE UNIQUE INDEX IF NOT EXISTS payroll_records_month_store_employee_id_unique
ON payroll_records (month, lower(trim(store::text)), employee_id)
WHERE employee_id IS NOT NULL;

