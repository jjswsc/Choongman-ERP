-- =============================================================================
-- 미수금 이중 수금 점검 (통장 통합 + 수금확인 수동)
-- 패턴 B: 동일 매장·동일일에
--   (1) ref_id IS NULL + bank_transaction_id 있음 + memo 통장 수령
--   (2) ref_id IS NOT NULL + bank_transaction_id NULL + memo 수금확인
--   (1)(2) 절대값 합계가 일치
-- Supabase SQL Editor — start_date / end_date 조정 후 Run
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-06-01' AS start_date,
    DATE '2026-06-30' AS end_date
),

consolidated AS (
  SELECT
    rt.id,
    rt.store_name,
    left(trim(rt.trans_date::text), 10) AS trans_date,
    rt.amount,
    rt.bank_transaction_id,
    rt.memo
  FROM public.receivable_transactions rt
  CROSS JOIN params p
  WHERE rt.ref_type = 'Receive'
    AND rt.ref_id IS NULL
    AND rt.bank_transaction_id IS NOT NULL
    AND rt.memo ILIKE '통장%'
    AND left(trim(rt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(rt.trans_date::text), 10)::date <= p.end_date
),

manual_invoice AS (
  SELECT
    rt.id,
    rt.store_name,
    rt.ref_id,
    left(trim(rt.trans_date::text), 10) AS trans_date,
    rt.amount,
    rt.memo
  FROM public.receivable_transactions rt
  CROSS JOIN params p
  WHERE rt.ref_type = 'Receive'
    AND rt.ref_id IS NOT NULL
    AND rt.bank_transaction_id IS NULL
    AND rt.memo ILIKE '수금확인%'
    AND left(trim(rt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(rt.trans_date::text), 10)::date <= p.end_date
),

consolidated_by_day AS (
  SELECT
    lower(regexp_replace(trim(c.store_name), '^cm\s+', '', 'i')) AS store_key,
    c.store_name,
    c.trans_date,
    sum(abs(c.amount)) AS consolidated_total,
    count(c.id)::int AS consolidated_count,
    array_agg(c.bank_transaction_id ORDER BY c.id) AS bank_transaction_ids,
    array_agg(c.id ORDER BY c.id) AS consolidated_recv_ids
  FROM consolidated c
  GROUP BY
    lower(regexp_replace(trim(c.store_name), '^cm\s+', '', 'i')),
    c.store_name,
    c.trans_date
),

manual_by_day AS (
  SELECT
    lower(regexp_replace(trim(m.store_name), '^cm\s+', '', 'i')) AS store_key,
    m.trans_date,
    sum(abs(m.amount)) AS manual_total,
    count(m.id)::int AS manual_count,
    array_agg(m.id ORDER BY m.id) AS manual_recv_ids
  FROM manual_invoice m
  GROUP BY
    lower(regexp_replace(trim(m.store_name), '^cm\s+', '', 'i')),
    m.trans_date
),

store_day AS (
  SELECT
    c.store_key,
    c.store_name,
    c.trans_date,
    c.consolidated_total,
    c.consolidated_count,
    c.bank_transaction_ids,
    c.consolidated_recv_ids,
    m.manual_total,
    m.manual_count,
    m.manual_recv_ids
  FROM consolidated_by_day c
  JOIN manual_by_day m
    ON m.store_key = c.store_key AND m.trans_date = c.trans_date
)

SELECT
  trans_date,
  store_name,
  consolidated_count,
  consolidated_total,
  bank_transaction_ids,
  manual_count,
  manual_total,
  manual_recv_ids,
  consolidated_recv_ids
FROM store_day
WHERE abs(consolidated_total - manual_total) <= 0.02
ORDER BY trans_date, store_name;

-- 정리는 receivable_bank_manual_double_cleanup_202606.sql ③ 참고
