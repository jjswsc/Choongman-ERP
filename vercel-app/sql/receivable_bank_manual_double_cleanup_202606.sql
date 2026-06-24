-- =============================================================================
-- 미수금 이중 수금 정리 — 통장 통합 수금 유지 + 수금확인(수동) 삭제
-- 대상: 2026-06 점검 10건 (통합 합계 = 수동 수금확인 합계)
-- Supabase SQL Editor — ①~③ 순서대로 실행 (③은 ② 확인 후)
-- =============================================================================

-- ① 대상 미리보기
WITH params AS (
  SELECT DATE '2026-06-01' AS start_date, DATE '2026-06-30' AS end_date
),
consolidated AS (
  SELECT
    rt.id,
    rt.store_name,
    lower(regexp_replace(trim(rt.store_name), '^cm\s+', '', 'i')) AS store_key,
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
    AND left(trim(rt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
),
manual_invoice AS (
  SELECT
    rt.id,
    rt.ref_id,
    rt.store_name,
    lower(regexp_replace(trim(rt.store_name), '^cm\s+', '', 'i')) AS store_key,
    left(trim(rt.trans_date::text), 10) AS trans_date,
    rt.amount,
    rt.memo
  FROM public.receivable_transactions rt
  CROSS JOIN params p
  WHERE rt.ref_type = 'Receive'
    AND rt.ref_id IS NOT NULL
    AND rt.bank_transaction_id IS NULL
    AND rt.memo ILIKE '수금확인%'
    AND left(trim(rt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
),
store_day_totals AS (
  SELECT
    c.store_key,
    max(c.store_name) AS store_name,
    c.trans_date,
    sum(abs(c.amount)) AS consolidated_total,
    count(c.id)::int AS consolidated_count,
    array_agg(c.id ORDER BY c.id) AS consolidated_recv_ids,
    array_agg(c.bank_transaction_id ORDER BY c.id) AS bank_transaction_ids
  FROM consolidated c
  GROUP BY c.store_key, c.trans_date
),
store_day_manual AS (
  SELECT
    m.store_key,
    m.trans_date,
    sum(abs(m.amount)) AS manual_total,
    count(m.id)::int AS manual_count,
    array_agg(m.id ORDER BY m.id) AS manual_recv_ids,
    array_agg(DISTINCT m.ref_id) AS accrual_ids
  FROM manual_invoice m
  GROUP BY m.store_key, m.trans_date
),
dup_groups AS (
  SELECT
    t.store_name,
    t.trans_date,
    t.consolidated_total,
    t.consolidated_count,
    t.bank_transaction_ids,
    t.consolidated_recv_ids,
    m.manual_total,
    m.manual_count,
    m.manual_recv_ids,
    m.accrual_ids
  FROM store_day_totals t
  JOIN store_day_manual m
    ON m.store_key = t.store_key AND m.trans_date = t.trans_date
  WHERE abs(t.consolidated_total - m.manual_total) <= 0.02
)
SELECT
  trans_date,
  store_name,
  consolidated_count,
  consolidated_total,
  bank_transaction_ids,
  consolidated_recv_ids,
  manual_count,
  manual_total,
  manual_recv_ids,
  accrual_ids
FROM dup_groups
ORDER BY trans_date, store_name;

-- ② 삭제·플래그 되돌리기 대상 행 수 (실행 전 확인)
/*
WITH ... dup_groups AS ( ... 위와 동일 CTE ... )
SELECT
  (SELECT count(*)::bigint FROM dup_groups) AS duplicate_store_days,
  (SELECT count(*)::bigint FROM dup_groups d, unnest(d.manual_recv_ids) x) AS manual_rows_to_delete,
  (SELECT count(*)::bigint FROM dup_groups d, unnest(d.accrual_ids) x) AS accruals_to_uncheck;
*/

-- =============================================================================
-- ③ 정리 실행 (② 확인 후 주석 해제하여 한 번에 실행)
-- =============================================================================
/*
BEGIN;

WITH params AS (
  SELECT DATE '2026-06-01' AS start_date, DATE '2026-06-30' AS end_date
),
consolidated AS (
  SELECT
    rt.id,
    rt.store_name,
    lower(regexp_replace(trim(rt.store_name), '^cm\s+', '', 'i')) AS store_key,
    left(trim(rt.trans_date::text), 10) AS trans_date,
    rt.amount,
    rt.bank_transaction_id
  FROM public.receivable_transactions rt
  CROSS JOIN params p
  WHERE rt.ref_type = 'Receive'
    AND rt.ref_id IS NULL
    AND rt.bank_transaction_id IS NOT NULL
    AND rt.memo ILIKE '통장%'
    AND left(trim(rt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
),
manual_invoice AS (
  SELECT
    rt.id,
    rt.ref_id,
    lower(regexp_replace(trim(rt.store_name), '^cm\s+', '', 'i')) AS store_key,
    left(trim(rt.trans_date::text), 10) AS trans_date,
    rt.amount
  FROM public.receivable_transactions rt
  CROSS JOIN params p
  WHERE rt.ref_type = 'Receive'
    AND rt.ref_id IS NOT NULL
    AND rt.bank_transaction_id IS NULL
    AND rt.memo ILIKE '수금확인%'
    AND left(trim(rt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
),
store_day_totals AS (
  SELECT
    c.store_key,
    c.trans_date,
    sum(abs(c.amount)) AS consolidated_total
  FROM consolidated c
  GROUP BY c.store_key, c.trans_date
),
store_day_manual AS (
  SELECT
    m.store_key,
    m.trans_date,
    sum(abs(m.amount)) AS manual_total,
    array_agg(m.id) AS manual_recv_ids,
    array_agg(DISTINCT m.ref_id) AS accrual_ids
  FROM manual_invoice m
  GROUP BY m.store_key, m.trans_date
),
dup_groups AS (
  SELECT m.manual_recv_ids, m.accrual_ids
  FROM store_day_totals t
  JOIN store_day_manual m
    ON m.store_key = t.store_key AND m.trans_date = t.trans_date
  WHERE abs(t.consolidated_total - m.manual_total) <= 0.02
),
manual_ids AS (
  SELECT DISTINCT unnest(manual_recv_ids) AS id FROM dup_groups
),
accrual_ids AS (
  SELECT DISTINCT unnest(accrual_ids) AS id FROM dup_groups
),
deleted AS (
  DELETE FROM public.receivable_transactions rt
  WHERE rt.id IN (SELECT id FROM manual_ids)
  RETURNING rt.id
),
unchecked AS (
  UPDATE public.receivable_transactions acc
  SET receive_checked = false
  WHERE acc.id IN (SELECT id FROM accrual_ids)
    AND NOT EXISTS (
      SELECT 1
      FROM public.receivable_transactions r2
      WHERE r2.ref_type = 'Receive'
        AND r2.ref_id = acc.id
    )
  RETURNING acc.id
)
SELECT
  (SELECT count(*) FROM deleted) AS deleted_manual_receives,
  (SELECT count(*) FROM unchecked) AS accruals_receive_unchecked;

COMMIT;
*/

-- ④ 정리 후 검증 (0건이어야 함)
-- node vercel-app/scripts/check-receivable-double-payment.mjs --start=2026-06-01 --end=2026-06-30
