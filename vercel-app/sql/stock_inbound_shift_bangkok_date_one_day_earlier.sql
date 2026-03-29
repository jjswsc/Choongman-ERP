-- =============================================================================
-- 1회성: ERP 도입일 입고를 「전날(방콕 달력)」로 옮깁니다.
--   · 복제가 아닙니다. 같은 행의 log_date / batch_date / trans_date 만 하루 앞으로 옮깁니다.
--   · UPDATE 가 0건이면 WHERE 가 데이터와 안 맞는 것입니다. 아래 0) 진단을 먼저 실행하세요.
-- =============================================================================

-- ▼▼▼ 연·월·일만 실제에 맞게 바꾸세요 (예: 2026-03-01 도입) ▼▼▼
-- 파일 전체에서 2026-03-01 / 2026-02-28 / UTC 구간을 검색·치환해 통일하세요.
-- UTC 구간은 「방콕 달력의 그날 하루」에 해당합니다 (서머타임 없음).

-- =============================================================================
-- 0) 진단 — 반드시 먼저 실행 (건수가 0이면 아래 UPDATE 도 0건입니다)
-- =============================================================================

-- stock_logs.log_date 컬럼 타입
SELECT column_name, data_type, udt_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'stock_logs'
  AND column_name = 'log_date';

-- log_type 실제 값 (대소문자·철자 확인)
SELECT log_type, count(*) AS cnt
FROM stock_logs
GROUP BY log_type
ORDER BY cnt DESC;

-- 2026-03-01 전후로 찍힌 Inbound 샘플 (날짜 표현 확인)
SELECT id,
       location,
       log_type,
       item_code,
       log_date,
       (log_date AT TIME ZONE 'Asia/Bangkok')::date AS bangkok_cal_date
FROM stock_logs
WHERE log_type = 'Inbound'
ORDER BY id DESC
LIMIT 80;

-- 「방콕으로 3월 1일」로 잡히는 행 개수 (기존 방식)
SELECT count(*) AS cnt_method_a
FROM stock_logs
WHERE log_type = 'Inbound'
  AND (log_date AT TIME ZONE 'Asia/Bangkok')::date = DATE '2026-03-01';

-- timestamptz 인 경우: 방콕 2026-03-01 하루 = UTC [2026-02-28 17:00, 2026-03-01 17:00)
SELECT count(*) AS cnt_method_b_utc_range
FROM stock_logs
WHERE log_type = 'Inbound'
  AND log_date >= timestamptz '2026-02-28 17:00:00+00'
  AND log_date < timestamptz '2026-03-01 17:00:00+00';

-- timestamp without time zone 인 경우가 많음: DB에 "벽시계"가 UTC 로 저장됐는지 방콕인지에 따라 다름.
-- 아래는 문자열 앞부분이 2026-03-01 로 시작하는 행 (진단용)
SELECT count(*) AS cnt_method_c_text_prefix
FROM stock_logs
WHERE log_type = 'Inbound'
  AND left(log_date::text, 10) = '2026-03-01';

-- =============================================================================
-- 1) stock_logs — 어떤 진단 cnt 가 맞는지 본 뒤, 하나의 UPDATE 만 실행하세요.
-- =============================================================================

-- --- 방법 A: timestamptz + 방콕 달력이 맞을 때 (기본) ---
UPDATE stock_logs
SET log_date = log_date - interval '1 day'
WHERE log_type = 'Inbound'
  AND (log_date AT TIME ZONE 'Asia/Bangkok')::date = DATE '2026-03-01';

-- --- 방법 B: log_date 가 timestamptz 이고, 방콕 3/1 하루를 UTC 구간으로 잡을 때 ---
-- (0)에서 cnt_method_b_utc_range 가 0보다 크고 A가 0일 때 사용
-- UPDATE stock_logs
-- SET log_date = log_date - interval '1 day'
-- WHERE log_type = 'Inbound'
--   AND log_date >= timestamptz '2026-02-28 17:00:00+00'
--   AND log_date < timestamptz '2026-03-01 17:00:00+00';

-- --- 방법 C: log_date 가 timestamp without time zone 이고, 저장값이 '2026-03-01 ...' 로 시작할 때 ---
-- (0)에서 cnt_method_c_text_prefix 가 0보다 클 때 사용
-- UPDATE stock_logs
-- SET log_date = (log_date - interval '1 day')
-- WHERE log_type = 'Inbound'
--   AND left(log_date::text, 10) = '2026-03-01';

-- --- 방법 D: 기초를 Inbound 가 아니라 재고조정(Adjustment)으로 넣었다면 ---
-- SELECT count(*) FROM stock_logs WHERE log_type = 'Adjustment' AND left(log_date::text, 10) = '2026-03-01';
-- UPDATE stock_logs
-- SET log_date = (log_date - interval '1 day')
-- WHERE log_type = 'Adjustment'
--   AND left(log_date::text, 10) = '2026-03-01';

-- =============================================================================
-- 2) inbound_batches
-- =============================================================================
SELECT id, location, batch_date, total_amount
FROM inbound_batches
WHERE batch_date = DATE '2026-03-01';

UPDATE inbound_batches
SET batch_date = batch_date - interval '1 day'
WHERE batch_date = DATE '2026-03-01';

-- batch_date 가 text 면:
-- UPDATE inbound_batches
-- SET batch_date = to_char((left(trim(batch_date::text), 10)::date - interval '1 day')::date, 'YYYY-MM-DD')
-- WHERE left(trim(batch_date::text), 10) = '2026-03-01';

-- =============================================================================
-- 3) payable_transactions (trans_date 가 text 인 경우)
-- =============================================================================
SELECT id, vendor_code, trans_date, memo, ref_id
FROM payable_transactions
WHERE ref_type = 'Inbound'
  AND left(trim(trans_date::text), 10) = '2026-03-01';

UPDATE payable_transactions
SET trans_date = to_char(
  (left(trim(trans_date::text), 10)::date - interval '1 day')::date,
  'YYYY-MM-DD'
)
WHERE ref_type = 'Inbound'
  AND left(trim(trans_date::text), 10) = '2026-03-01';

-- =============================================================================
-- 참고: 이미 방법 A UPDATE 가 0건으로 끝났다면 데이터는 안 바뀐 상태입니다.
--       0) 진단에서 cnt 가 나오는 방법의 UPDATE 만 다시 실행하면 됩니다.
-- =============================================================================
