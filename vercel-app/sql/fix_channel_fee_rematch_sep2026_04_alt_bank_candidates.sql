-- 대체 후보 — 이것만 복사 → Run
-- 충돌(#13479→485, #13261→271, #14030→610)이 난 3건에 대해
-- 같은 매장·채널 ±3일 입금 중, 아직 어떤 정산에도 안 묶인 통장만 추천.

WITH bad AS (
  SELECT * FROM (
    VALUES
      (236, 'CM Silom'::text, DATE '2026-09-05', 'grab'::text, 1319.00::numeric, 0.72::numeric),
      (275, 'CM Silom', DATE '2026-09-06', 'grab', 3410.00, 0.72),
      (422, 'CM MBK', DATE '2026-09-12', 'grab', 10357.00, 0.72)
  ) AS t(settlement_id, store_code, settle_date, channel, gross_amt, net_ratio)
),
cand AS (
  SELECT
    b.settlement_id,
    b.store_code,
    b.settle_date,
    b.channel,
    b.gross_amt,
    ROUND(b.gross_amt * b.net_ratio, 2) AS expected_net,
    bt.id AS candidate_bank_id,
    bt.trans_date AS cand_trans_date,
    bt.sales_date AS cand_sales_date,
    ROUND(ABS(COALESCE(bt.amount, 0))::numeric, 2) AS cand_amt,
    ROUND(ABS(ABS(COALESCE(bt.amount, 0))::numeric - (b.gross_amt * b.net_ratio)), 2) AS dist_to_expected,
    ROUND(
      ((b.gross_amt - ABS(COALESCE(bt.amount, 0))) / NULLIF(b.gross_amt, 0)) * 1000
    ) / 10.0 AS would_be_fee_pct,
    left(COALESCE(bt.memo, bt.note, ''), 80) AS cand_memo,
    (
      SELECT o.id
      FROM public.pos_channel_settlements o
      WHERE o.bank_transaction_id = bt.id
      LIMIT 1
    ) AS already_linked_settlement_id
  FROM bad b
  JOIN public.bank_transactions bt
    ON bt.trans_type = 'deposit'
   AND lower(trim(coalesce(bt.category, ''))) IN ('receivable_receive', '')
   AND ABS(COALESCE(bt.amount, 0)) > 1
   AND left(trim(bt.trans_date::text), 10)::date
         BETWEEN (b.settle_date - 3) AND (b.settle_date + 3)
   AND (
        lower(regexp_replace(trim(COALESCE(bt.store_name, bt.store, '')), '^cm\s+', '', 'i'))
          = lower(regexp_replace(trim(b.store_code), '^cm\s+', '', 'i'))
        OR lower(COALESCE(bt.memo, '') || ' ' || COALESCE(bt.note, '')) LIKE '%grab%'
      )
)
SELECT *
FROM cand
WHERE already_linked_settlement_id IS NULL
  AND would_be_fee_pct BETWEEN 0 AND 35
ORDER BY settlement_id, dist_to_expected, candidate_bank_id
LIMIT 60;
