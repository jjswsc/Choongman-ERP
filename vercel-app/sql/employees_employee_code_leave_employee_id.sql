-- 직원 코드(매장별 AA999, 매장 접두 2글자 고유) + 휴가 행의 직원 FK
-- Supabase SQL Editor에서 실행 후 앱 배포.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS employee_code text;
ALTER TABLE leave_requests ADD COLUMN IF NOT EXISTS employee_id bigint REFERENCES employees (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_leave_requests_employee_id ON leave_requests (employee_id);

-- [중요] 과거 전역 유니크 인덱스는 제거
DROP INDEX IF EXISTS employees_employee_code_lower_unique;

-- 1) 직원코드 재구성:
--    - 접두 2글자는 매장명에서 유도한 후보를 우선 사용, 전역 중복 시 다음 후보
--    - 같은 매장 안에서는 ID 순으로 001..999
--    - 앱의 saveAdminEmployee prefixCandidatesForStore 와 동일한 우선순위를 맞춤

CREATE OR REPLACE FUNCTION cm_erp_emp_prefix_candidates(p_store text)
RETURNS text[] LANGUAGE plpgsql AS $$
DECLARE
  lets text;
  cands text[] := ARRAY[]::text[];
  p text;
  i int;
  j int;
  k int;
  w text;
  words text[];
  ini text;
  walpha text;
BEGIN
  lets := upper(regexp_replace(trim(coalesce(p_store, '')), '[^A-Za-z]', '', 'g'));

  -- 연속 2글자 (순서)
  IF length(lets) >= 2 THEN
    FOR i IN 1..(length(lets) - 1) LOOP
      p := substr(lets, i, 2);
      IF NOT (p = ANY(cands)) THEN cands := array_append(cands, p); END IF;
    END LOOP;
  END IF;

  -- 앞 2글자
  IF length(lets) >= 2 THEN
    p := substr(lets, 1, 2);
    IF NOT (p = ANY(cands)) THEN cands := array_append(cands, p); END IF;
  END IF;

  -- 단어 이니셜 (공백 분리, 알파벳만)
  words := regexp_split_to_array(trim(coalesce(p_store, '')), '\s+');
  IF array_length(words, 1) IS NOT NULL AND array_length(words, 1) >= 2 THEN
    ini := '';
    FOR i IN 1..least(array_length(words, 1), 4) LOOP
      walpha := upper(regexp_replace(words[i], '[^A-Za-z]', '', 'g'));
      IF length(walpha) >= 1 THEN
        ini := ini || substr(walpha, 1, 1);
      END IF;
      IF length(ini) >= 2 THEN EXIT; END IF;
    END LOOP;
    IF length(ini) >= 2 THEN
      p := substr(ini, 1, 2);
      IF NOT (p = ANY(cands)) THEN cands := array_append(cands, p); END IF;
    END IF;
  END IF;

  -- 모든 i<j 쌍
  FOR i IN 1..length(lets) LOOP
    FOR j IN (i + 1)..length(lets) LOOP
      p := substr(lets, i, 1) || substr(lets, j, 1);
      IF NOT (p = ANY(cands)) THEN cands := array_append(cands, p); END IF;
    END LOOP;
  END LOOP;

  -- 첫+끝
  IF length(lets) >= 2 THEN
    p := substr(lets, 1, 1) || substr(lets, length(lets), 1);
    IF NOT (p = ANY(cands)) THEN cands := array_append(cands, p); END IF;
  END IF;

  IF length(lets) = 1 THEN
    p := lets || 'X';
    IF NOT (p = ANY(cands)) THEN cands := array_append(cands, p); END IF;
    FOR k IN 0..25 LOOP
      p := lets || chr(65 + k);
      IF NOT (p = ANY(cands)) THEN cands := array_append(cands, p); END IF;
    END LOOP;
  END IF;

  IF length(lets) = 0 THEN
    IF NOT ('ST' = ANY(cands)) THEN cands := array_append(cands, 'ST'); END IF;
  END IF;

  FOR i IN 0..25 LOOP
    FOR j IN 0..25 LOOP
      p := chr(65 + i) || chr(65 + j);
      IF NOT (p = ANY(cands)) THEN cands := array_append(cands, p); END IF;
    END LOOP;
  END LOOP;

  RETURN cands;
END;
$$;

DO $$
DECLARE
  r RECORD;
  used text[] := ARRAY[]::text[];
  cand text;
  cands text[];
  seq int;
  eid bigint;
  sk text;
BEGIN
  -- DISTINCT + ORDER BY 규칙: 정렬은 바깥 SELECT에서 (42P10 방지)
  FOR r IN
    SELECT s.store_key
    FROM (
      SELECT DISTINCT trim(coalesce(store, '')) AS store_key
      FROM employees
      WHERE trim(coalesce(store, '')) <> ''
    ) s
    ORDER BY lower(s.store_key), s.store_key
  LOOP
    sk := r.store_key;
    cands := cm_erp_emp_prefix_candidates(sk);
    cand := NULL;
    FOR cix IN 1..coalesce(array_length(cands, 1), 0) LOOP
      IF NOT (cands[cix] = ANY(used)) THEN
        cand := cands[cix];
        EXIT;
      END IF;
    END LOOP;
    IF cand IS NULL THEN cand := 'ST'; END IF;
    used := array_append(used, cand);

    seq := 0;
    FOR eid IN
      SELECT id FROM employees
      WHERE lower(trim(coalesce(store, ''))) = lower(trim(sk))
      ORDER BY id
    LOOP
      seq := seq + 1;
      IF seq > 999 THEN
        RAISE EXCEPTION '매장 % 직원이 999명을 초과하여 코드를 부여할 수 없습니다.', sk;
      END IF;
      UPDATE employees
      SET employee_code = cand || lpad(seq::text, 3, '0')
      WHERE id = eid;
    END LOOP;
  END LOOP;
END $$;

DROP FUNCTION IF EXISTS cm_erp_emp_prefix_candidates(text);

-- 2) leave_requests.employee_id 백필 (이미 값이 있으면 유지)
WITH matched AS (
  SELECT
    lr.ctid AS lr_tid,
    e.id AS emp_id,
    row_number() OVER (
      PARTITION BY lr.ctid
      ORDER BY e.id
    ) AS rn
  FROM leave_requests lr
  JOIN employees e
    ON lower(trim(coalesce(lr.store, ''))) = lower(trim(coalesce(e.store, '')))
   AND lower(trim(coalesce(lr.name, ''))) = lower(trim(coalesce(e.name, '')))
  WHERE lr.employee_id IS NULL
)
UPDATE leave_requests lr
SET employee_id = m.emp_id
FROM matched m
WHERE lr.ctid = m.lr_tid
  AND m.rn = 1;

-- 형식 검사(빈값 허용): 반드시 AA999
DO $$
BEGIN
  ALTER TABLE employees
    ADD CONSTRAINT employees_employee_code_format_ck
    CHECK (
      employee_code IS NULL
      OR trim(employee_code) = ''
      OR upper(trim(employee_code)) ~ '^[A-Z]{2}[0-9]{3}$'
    );
EXCEPTION WHEN duplicate_object THEN
  NULL;
END $$;

-- 매장별 코드 유일(대소문자/공백 무시)
CREATE UNIQUE INDEX IF NOT EXISTS employees_store_employee_code_unique
ON employees (lower(trim(store::text)), lower(trim(employee_code::text)))
WHERE employee_code IS NOT NULL AND trim(employee_code::text) <> '';
