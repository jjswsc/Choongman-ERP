-- 1/3 2026-09 수수료율 비정상 채널 정산 목록
-- SELECT만. 이것만 복사 → Run
-- 상한: grab 28 / lineman 26 / shopee 20 / card 8 (앱 코드와 동일)
SELECT
  pcs.id AS settlement_id,
  pcs.store_code,
  pcs.settle_date,
  pcs.channel,
  pcs.gross_amt,
  pcs.net_amt,
  pcs.fee_amt,
  ROUND((pcs.fee_amt / NULLIF(pcs.gross_amt, 0)) * 1000) / 10.0 AS fee_pct,
  CASE lower(trim(pcs.channel))
    WHEN 'card' THEN 8
    WHEN 'grab' THEN 28
    WHEN 'lineman' THEN 26
    WHEN 'shopee' THEN 20
    ELSE 28
  END AS max_pct,
  pcs.fee_source,
  pcs.bank_transaction_id,
  pcs.memo
FROM public.pos_channel_settlements pcs
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
