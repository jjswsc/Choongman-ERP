-- 3/3 극단(수수료율>50%) 건 — 같은 매장·채널 근처 입금 후보
-- SELECT만. 이것만 복사 → Run
-- 올바른 Grab 입금은 보통 NET ≈ GROSS×0.72 근처. 후보 중 그 구간에 가까운 행을 보세요.
WITH extreme AS (
  SELECT
    pcs.id AS settlement_id,
    pcs.store_code,
    pcs.settle_date,
    pcs.channel,
    pcs.gross_amt,
    pcs.net_amt,
    pcs.fee_amt,
    ROUND((pcs.fee_amt / NULLIF(pcs.gross_amt, 0)) * 1000) / 10.0 AS fee_pct,
    pcs.bank_transaction_id AS linked_bank_id,
    ROUND(pcs.gross_amt * 0.72, 2) AS expected_net_approx
  FROM public.pos_channel_settlements pcs
  WHERE pcs.settle_date >= DATE '2026-09-01'
    AND pcs.settle_date <= DATE '2026-09-30'
    AND pcs.gross_amt > 0
    AND pcs.fee_amt > 0
    AND lower(trim(coalesce(pcs.fee_source, ''))) NOT IN ('manual_confirmed', 'csv_import')
    AND (pcs.fee_amt / pcs.gross_amt) * 100 > 50
),
cand AS (
  SELECT
    e.settlement_id,
    e.store_code,
    e.settle_date,
    e.channel,
    e.gross_amt,
    e.net_amt AS linked_net,
    e.fee_pct,
    e.linked_bank_id,
    e.expected_net_approx,
    bt.id AS candidate_bank_id,
    bt.trans_date AS cand_trans_date,
    bt.sales_date AS cand_sales_date,
    ROUND(ABS(COALESCE(bt.amount, 0))::numeric, 2) AS cand_amt,
    ROUND(ABS(ABS(COALESCE(bt.amount, 0))::numeric - e.expected_net_approx), 2) AS dist_to_expected,
    left(COALESCE(bt.memo, bt.note, ''), 80) AS cand_memo
  FROM extreme e
  JOIN public.bank_transactions bt
    ON bt.trans_type = 'deposit'
   AND lower(trim(coalesce(bt.category, ''))) IN ('receivable_receive', '')
   AND ABS(COALESCE(bt.amount, 0)) > 1
   AND left(trim(bt.trans_date::text), 10)::date
         BETWEEN (e.settle_date - 3) AND (e.settle_date + 3)
   AND (
        lower(regexp_replace(trim(COALESCE(bt.store_name, bt.store, '')), '^cm\s+', '', 'i'))
          = lower(regexp_replace(trim(e.store_code), '^cm\s+', '', 'i'))
        OR lower(COALESCE(bt.memo, '') || ' ' || COALESCE(bt.note, ''))
             LIKE '%' || lower(e.channel) || '%'
      )
)
SELECT *
FROM cand
ORDER BY settlement_id, dist_to_expected, candidate_bank_id;
