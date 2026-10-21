-- 2/3 비정상 정산 ↔ 연결된 통장 입금 대조 (금액·매출일·적요)
-- SELECT만. 이것만 복사 → Run
-- bank_amt 와 net_amt 가 크게 다르거나, sales_date/trans_date 가 settle_date 와 어긋나면 오매칭 의심
SELECT
  pcs.id AS settlement_id,
  pcs.store_code,
  pcs.settle_date,
  pcs.channel,
  pcs.gross_amt,
  pcs.net_amt,
  pcs.fee_amt,
  ROUND((pcs.fee_amt / NULLIF(pcs.gross_amt, 0)) * 1000) / 10.0 AS fee_pct,
  pcs.bank_transaction_id AS bank_id,
  bt.trans_date AS bank_trans_date,
  bt.sales_date AS bank_sales_date,
  ROUND(ABS(COALESCE(bt.amount, 0))::numeric, 2) AS bank_amt,
  ROUND(ABS(COALESCE(bt.amount, 0))::numeric - pcs.net_amt, 2) AS bank_minus_net,
  bt.category AS bank_category,
  COALESCE(bt.store_name, bt.store, '') AS bank_store,
  left(COALESCE(bt.memo, ''), 80) AS bank_memo,
  left(COALESCE(bt.note, ''), 80) AS bank_note
FROM public.pos_channel_settlements pcs
LEFT JOIN public.bank_transactions bt ON bt.id = pcs.bank_transaction_id
WHERE pcs.settle_date >= DATE '2026-09-01'
  AND pcs.settle_date <= DATE '2026-09-30'
  AND pcs.gross_amt > 0
  AND pcs.fee_amt > 0
  AND lower(trim(coalesce(pcs.fee_source, ''))) NOT IN ('manual_confirmed', 'csv_import')
  AND (pcs.fee_amt / pcs.gross_amt) * 100
    > CASE lower(trim(pcs.channel))
        WHEN 'card' THEN 8
        WHEN 'grab' THEN 28
        WHEN 'lineman' THEN 26
        WHEN 'shopee' THEN 20
        ELSE 28
      END
ORDER BY (pcs.fee_amt / pcs.gross_amt) DESC, pcs.settle_date, pcs.id;
