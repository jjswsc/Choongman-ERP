-- 매장 방문 중복 open 정리 (2026-08-07 진단 결과 반영)
-- 방콕 시간. Supabase SQL Editor에서 위에서 아래로 실행.
--
-- 진단 요약:
--   Molphila Nam-naul (Grace) | CM True Digital | starts 5 / ends 2 / open_est 3  ← 버그
--   Molphila Nam-naul         | CM Silom        | starts 2 / ends 1 / open_est 1  ← 최신 1건만 유지
--   Choi Joo yong             | CM Bangna       | open_est 1  ← 정상 방문 중으로 둠 (손대지 않음)
--   Vilaisak                  | CM MBK          | open_est 1  ← 정상 방문 중으로 둠 (손대지 않음)
--
-- 정책: Molphila만 — 미종료 시작을 짝짓기한 뒤, 가장 마지막 시작 1건만 남기고 나머지 강제 종료.

-- ========== A) Molphila 당일 이벤트 확인 ==========
SELECT id, visit_date, name, store_name, visit_type, purpose, visit_time, duration_min, memo, created_at
FROM store_visits
WHERE visit_date >= '2026-08-06'
  AND visit_date <= '2026-08-07'
  AND name = 'Molphila Nam-naul'
  AND visit_type IN ('방문시작', '강제 방문시작', '방문종료', '강제 방문종료')
ORDER BY visit_date ASC, visit_time ASC, created_at ASC NULLS LAST;

-- ========== B) 미종료 시작 스택 미리보기 (실행해도 데이터 변경 없음) ==========
DROP TABLE IF EXISTS _molphila_open_stack;
CREATE TEMP TABLE _molphila_open_stack (
  seq serial PRIMARY KEY,
  start_id text NOT NULL,
  store_name text NOT NULL,
  purpose text,
  visit_date date NOT NULL,
  visit_time text NOT NULL,
  created_at timestamptz
);

DO $$
DECLARE
  r RECORD;
  closed_seq int;
BEGIN
  TRUNCATE _molphila_open_stack;
  FOR r IN
    SELECT
      id,
      store_name,
      visit_type,
      COALESCE(NULLIF(trim(purpose), ''), '기타') AS purpose,
      visit_date,
      COALESCE(NULLIF(trim(visit_time), ''), '00:00:00') AS visit_time,
      created_at
    FROM store_visits
    WHERE visit_date >= '2026-08-06'
      AND visit_date <= '2026-08-07'
      AND name = 'Molphila Nam-naul'
      AND visit_type IN ('방문시작', '강제 방문시작', '방문종료', '강제 방문종료')
    ORDER BY visit_date ASC, visit_time ASC, created_at ASC NULLS LAST
  LOOP
    IF r.visit_type IN ('방문시작', '강제 방문시작') THEN
      INSERT INTO _molphila_open_stack (start_id, store_name, purpose, visit_date, visit_time, created_at)
      VALUES (r.id, r.store_name, r.purpose, r.visit_date, r.visit_time, r.created_at);
    ELSE
      SELECT s.seq INTO closed_seq
      FROM _molphila_open_stack s
      WHERE s.store_name = r.store_name
      ORDER BY s.seq DESC
      LIMIT 1;
      IF closed_seq IS NOT NULL THEN
        DELETE FROM _molphila_open_stack WHERE seq = closed_seq;
      END IF;
    END IF;
  END LOOP;
END $$;

-- 남아 있는 open (예상: True Digital 여러 건 + Silom 최신 1건)
SELECT * FROM _molphila_open_stack ORDER BY seq;

-- ========== C) 최신 1건만 남기고 나머지 강제 종료 (미리보기) ==========
WITH kept AS (
  SELECT * FROM _molphila_open_stack
  ORDER BY seq DESC
  LIMIT 1
),
to_close AS (
  SELECT o.*
  FROM _molphila_open_stack o
  WHERE o.seq < (SELECT seq FROM kept)
),
close_at AS (
  -- 남길 방문의 시작 시각에 맞춰 이전 open 종료 (동시 방문 과대 집계 제거)
  SELECT
    k.visit_date AS close_date,
    k.visit_time AS close_time,
    (k.visit_date::text || 'T' ||
      CASE
        WHEN length(k.visit_time) >= 8 THEN left(k.visit_time, 8)
        WHEN length(k.visit_time) >= 5 THEN left(k.visit_time, 5) || ':00'
        ELSE '00:00:00'
      END || '+07:00'
    )::timestamptz AS close_ts
  FROM kept k
)
SELECT
  'Vfix' || substr(md5(t.start_id || t.seq::text), 1, 14) AS new_id,
  c.close_date AS visit_date,
  'Molphila Nam-naul'::text AS name,
  t.store_name,
  '강제 방문종료'::text AS visit_type,
  t.purpose,
  c.close_time AS visit_time,
  GREATEST(
    0,
    floor(
      EXTRACT(
        EPOCH FROM (
          c.close_ts
          - (t.visit_date::text || 'T' ||
              CASE
                WHEN length(t.visit_time) >= 8 THEN left(t.visit_time, 8)
                WHEN length(t.visit_time) >= 5 THEN left(t.visit_time, 5) || ':00'
                ELSE '00:00:00'
              END || '+07:00'
            )::timestamptz
        )
      ) / 60
    )::int
  ) AS duration_min,
  'fix-duplicate-open-2026-08-07'::text AS memo,
  t.start_id AS closes_start_id,
  t.seq
FROM to_close t
CROSS JOIN close_at c
ORDER BY t.seq;

-- ========== D) 실제 INSERT (C 미리보기 확인 후 주석 해제하고 실행) ==========
/*
WITH kept AS (
  SELECT * FROM _molphila_open_stack
  ORDER BY seq DESC
  LIMIT 1
),
to_close AS (
  SELECT o.*
  FROM _molphila_open_stack o
  WHERE o.seq < (SELECT seq FROM kept)
),
close_at AS (
  SELECT
    k.visit_date AS close_date,
    k.visit_time AS close_time,
    (k.visit_date::text || 'T' ||
      CASE
        WHEN length(k.visit_time) >= 8 THEN left(k.visit_time, 8)
        WHEN length(k.visit_time) >= 5 THEN left(k.visit_time, 5) || ':00'
        ELSE '00:00:00'
      END || '+07:00'
    )::timestamptz AS close_ts
  FROM kept k
),
rows_to_insert AS (
  SELECT
    'Vfix' || substr(md5(t.start_id || t.seq::text), 1, 14) AS id,
    c.close_date AS visit_date,
    'Molphila Nam-naul'::text AS name,
    t.store_name,
    '강제 방문종료'::text AS visit_type,
    t.purpose,
    c.close_time AS visit_time,
    ''::text AS lat,
    ''::text AS lng,
    GREATEST(
      0,
      floor(
        EXTRACT(
          EPOCH FROM (
            c.close_ts
            - (t.visit_date::text || 'T' ||
                CASE
                  WHEN length(t.visit_time) >= 8 THEN left(t.visit_time, 8)
                  WHEN length(t.visit_time) >= 5 THEN left(t.visit_time, 5) || ':00'
                  ELSE '00:00:00'
                END || '+07:00'
              )::timestamptz
          )
        ) / 60
      )::int
    ) AS duration_min,
    'fix-duplicate-open-2026-08-07'::text AS memo
  FROM to_close t
  CROSS JOIN close_at c
)
INSERT INTO store_visits (
  id, visit_date, name, store_name, visit_type, purpose,
  visit_time, lat, lng, duration_min, memo
)
SELECT id, visit_date, name, store_name, visit_type, purpose,
       visit_time, lat, lng, duration_min, memo
FROM rows_to_insert;
*/

-- ========== E) 정리 후 재진단 (D 실행 후) ==========
/*
-- B의 DO 블록을 다시 실행한 뒤:
SELECT * FROM _molphila_open_stack ORDER BY seq;
-- 기대: Silom(또는 최신 매장) 1행만
*/
