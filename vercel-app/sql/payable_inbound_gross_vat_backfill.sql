-- =============================================================================
-- 입고(Inbound) 미지급 금액 — 공급가 → VAT 포함 합계 (미리보기 SQL)
--
-- 권장 실행(입고 화면과 동일: 줄별 VAT 합산):
--   node scripts/apply-inbound-payable-gross-vat-backfill.mjs --dry-run
--   node scripts/apply-inbound-payable-gross-vat-backfill.mjs --execute
--
-- 아래 SQL은 배치 과세총액×7% 방식(입고 UI와 1~수 밧 차이 가능) — 참고용
-- =============================================================================

-- (1) 미리보기: 배치별 현재 vs 보정 후
WITH lines AS (
  SELECT
    sl.inbound_batch_id AS batch_id,
    sl.log_date,
    ROUND((COALESCE(sl.qty, 0) * COALESCE(sl.unit_cost, 0))::numeric, 2) AS net,
    CASE
      WHEN lower(trim(coalesce(i.tax, ''))) IN ('면세', 'exempt', '영세율', 'zero') THEN 'exempt'
      ELSE 'taxable'
    END AS tax_kind
  FROM public.stock_logs sl
  LEFT JOIN public.items i ON lower(trim(i.code)) = lower(trim(sl.item_code))
  WHERE sl.inbound_batch_id IS NOT NULL
    AND sl.log_type = 'Inbound'
),
agg AS (
  SELECT
    l.batch_id,
    MAX((l.log_date AT TIME ZONE 'Asia/Bangkok')::date) AS batch_date_ymd,
    COALESCE(SUM(l.net) FILTER (WHERE l.tax_kind = 'taxable'), 0) AS taxable_net,
    COALESCE(SUM(l.net) FILTER (WHERE l.tax_kind = 'exempt'), 0) AS exempt_net
  FROM lines l
  GROUP BY l.batch_id
),
calc AS (
  SELECT
    batch_id,
    batch_date_ymd,
    ROUND(taxable_net, 2) AS taxable_net,
    ROUND(exempt_net, 2) AS exempt_net,
    ROUND(
      COALESCE(exempt_net, 0)
      + COALESCE(taxable_net, 0)
      + ROUND(COALESCE(taxable_net, 0) * 0.07, 2),
      2
    ) AS gross_total
  FROM agg
)
SELECT
  c.batch_id,
  ib.batch_date AS old_batch_date,
  c.batch_date_ymd AS new_batch_date,
  ib.total_amount AS old_batch_total,
  c.gross_total AS new_gross_total,
  pt.id AS payable_id,
  pt.trans_date AS old_payable_date,
  pt.amount AS old_payable_amount,
  c.gross_total AS new_payable_amount
FROM calc c
JOIN public.inbound_batches ib ON ib.id = c.batch_id
LEFT JOIN public.payable_transactions pt
  ON pt.ref_type = 'Inbound' AND pt.ref_id = c.batch_id
WHERE c.gross_total > 0
  AND (
    ABS(COALESCE(pt.amount, 0) - c.gross_total) > 0.02
    OR left(trim(coalesce(pt.trans_date::text, '')), 10)::date IS DISTINCT FROM c.batch_date_ymd
    OR ib.batch_date IS DISTINCT FROM c.batch_date_ymd
    OR ABS(COALESCE(ib.total_amount, 0) - c.gross_total) > 0.02
  )
ORDER BY c.batch_id;

-- (2) 보정 적용 (미리보기 확인 후 주석 해제)
/*
WITH lines AS (
  SELECT
    sl.inbound_batch_id AS batch_id,
    sl.log_date,
    ROUND((COALESCE(sl.qty, 0) * COALESCE(sl.unit_cost, 0))::numeric, 2) AS net,
    CASE
      WHEN lower(trim(coalesce(i.tax, ''))) IN ('면세', 'exempt', '영세율', 'zero') THEN 'exempt'
      ELSE 'taxable'
    END AS tax_kind
  FROM public.stock_logs sl
  LEFT JOIN public.items i ON lower(trim(i.code)) = lower(trim(sl.item_code))
  WHERE sl.inbound_batch_id IS NOT NULL
    AND sl.log_type = 'Inbound'
),
agg AS (
  SELECT
    l.batch_id,
    MAX((l.log_date AT TIME ZONE 'Asia/Bangkok')::date) AS batch_date_ymd,
    COALESCE(SUM(l.net) FILTER (WHERE l.tax_kind = 'taxable'), 0) AS taxable_net,
    COALESCE(SUM(l.net) FILTER (WHERE l.tax_kind = 'exempt'), 0) AS exempt_net
  FROM lines l
  GROUP BY l.batch_id
),
calc AS (
  SELECT
    batch_id,
    batch_date_ymd,
    ROUND(
      COALESCE(exempt_net, 0)
      + COALESCE(taxable_net, 0)
      + ROUND(COALESCE(taxable_net, 0) * 0.07, 2),
      2
    ) AS gross_total
  FROM agg
)
UPDATE public.inbound_batches ib
SET
  batch_date = c.batch_date_ymd,
  total_amount = c.gross_total
FROM calc c
WHERE ib.id = c.batch_id
  AND c.gross_total > 0;

WITH lines AS (
  SELECT
    sl.inbound_batch_id AS batch_id,
    sl.log_date,
    ROUND((COALESCE(sl.qty, 0) * COALESCE(sl.unit_cost, 0))::numeric, 2) AS net,
    CASE
      WHEN lower(trim(coalesce(i.tax, ''))) IN ('면세', 'exempt', '영세율', 'zero') THEN 'exempt'
      ELSE 'taxable'
    END AS tax_kind
  FROM public.stock_logs sl
  LEFT JOIN public.items i ON lower(trim(i.code)) = lower(trim(sl.item_code))
  WHERE sl.inbound_batch_id IS NOT NULL
    AND sl.log_type = 'Inbound'
),
agg AS (
  SELECT
    l.batch_id,
    MAX((l.log_date AT TIME ZONE 'Asia/Bangkok')::date) AS batch_date_ymd,
    COALESCE(SUM(l.net) FILTER (WHERE l.tax_kind = 'taxable'), 0) AS taxable_net,
    COALESCE(SUM(l.net) FILTER (WHERE l.tax_kind = 'exempt'), 0) AS exempt_net
  FROM lines l
  GROUP BY l.batch_id
),
calc AS (
  SELECT
    batch_id,
    batch_date_ymd,
    ROUND(
      COALESCE(exempt_net, 0)
      + COALESCE(taxable_net, 0)
      + ROUND(COALESCE(taxable_net, 0) * 0.07, 2),
      2
    ) AS gross_total
  FROM agg
)
UPDATE public.payable_transactions pt
SET
  amount = c.gross_total,
  trans_date = c.batch_date_ymd,
  memo = LEFT('입고 ' || c.batch_date_ymd::text || ' ' || COALESCE(ib.vendor_name, ''), 240)
FROM calc c
JOIN public.inbound_batches ib ON ib.id = c.batch_id
WHERE pt.ref_type = 'Inbound'
  AND pt.ref_id = c.batch_id
  AND c.gross_total > 0;
*/
