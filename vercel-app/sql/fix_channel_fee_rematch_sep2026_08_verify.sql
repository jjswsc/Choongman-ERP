-- 검증 — 이것만 복사 → Run
-- #362: bank #13638, fee ~4.9%, fee_source=auto_bank_chip_rematch
-- #236/#275/#293/#422: bank_transaction_id NULL, fee_source=unlinked_implausible

SELECT
  pcs.id AS settlement_id,
  pcs.store_code,
  pcs.settle_date,
  pcs.channel,
  pcs.gross_amt,
  pcs.net_amt,
  pcs.fee_amt,
  ROUND((pcs.fee_amt / NULLIF(pcs.gross_amt, 0)) * 1000) / 10.0 AS fee_pct,
  pcs.bank_transaction_id,
  pcs.journal_entry_id,
  pcs.fee_source,
  left(COALESCE(pcs.memo, ''), 100) AS memo
FROM public.pos_channel_settlements pcs
WHERE pcs.id IN (236, 275, 293, 362, 422)
ORDER BY pcs.id;
