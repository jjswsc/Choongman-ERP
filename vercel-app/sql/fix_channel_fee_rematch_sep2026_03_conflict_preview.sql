-- 충돌 미리보기 — 이것만 복사 → Run
-- 01에서 new_bank_already_linked_settlement_id 가 있던 정산(#485,#271,#610)과
-- 아직 통장이 비어 있어 바로 재연결 가능한 건(#293,#362)을 함께 봅니다.

WITH focus AS (
  SELECT * FROM (
    VALUES
      (236, 13090, 13479, 485),
      (275, 13274, 13261, 271),
      (422, 13761, 14030, 610),
      (293, 13361, 13362, NULL::integer),
      (362, 13637, 13638, NULL::integer)
  ) AS t(bad_id, old_bank_id, want_bank_id, conflict_id)
)
SELECT
  'bad' AS role,
  pcs.id AS settlement_id,
  pcs.store_code,
  pcs.settle_date,
  pcs.channel,
  pcs.gross_amt,
  pcs.net_amt,
  pcs.fee_amt,
  ROUND((pcs.fee_amt / NULLIF(pcs.gross_amt, 0)) * 1000) / 10.0 AS fee_pct,
  pcs.bank_transaction_id,
  pcs.fee_source,
  left(COALESCE(pcs.memo, ''), 80) AS memo,
  f.want_bank_id,
  f.conflict_id
FROM focus f
JOIN public.pos_channel_settlements pcs ON pcs.id = f.bad_id

UNION ALL

SELECT
  'conflict' AS role,
  pcs.id,
  pcs.store_code,
  pcs.settle_date,
  pcs.channel,
  pcs.gross_amt,
  pcs.net_amt,
  pcs.fee_amt,
  ROUND((pcs.fee_amt / NULLIF(pcs.gross_amt, 0)) * 1000) / 10.0,
  pcs.bank_transaction_id,
  pcs.fee_source,
  left(COALESCE(pcs.memo, ''), 80),
  f.want_bank_id,
  f.conflict_id
FROM focus f
JOIN public.pos_channel_settlements pcs ON pcs.id = f.conflict_id
WHERE f.conflict_id IS NOT NULL

UNION ALL

SELECT
  'want_bank' AS role,
  bt.id,
  COALESCE(bt.store_name, bt.store),
  COALESCE(bt.sales_date, bt.trans_date)::date,
  NULL,
  NULL,
  ROUND(ABS(COALESCE(bt.amount, 0))::numeric, 2),
  NULL,
  NULL,
  bt.id,
  bt.category,
  left(COALESCE(bt.memo, bt.note, ''), 80),
  f.want_bank_id,
  f.conflict_id
FROM focus f
JOIN public.bank_transactions bt ON bt.id = f.want_bank_id

ORDER BY want_bank_id, role, settlement_id;
