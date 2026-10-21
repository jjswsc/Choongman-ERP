-- 1/2 미리보기 — 이것만 복사 → Run
-- 2026-09 극단 수수료(소액 입금↔당일 POS GROSS) 우선 5건 재연결 후보.
-- 영업 중·POS 켜진 상태에서도 SELECT만이라 안전. UPDATE는 02_apply.
-- pos_orders 미수정.

WITH plan(settlement_id, old_bank_id, new_bank_id, note) AS (
  VALUES
    (236, 13090, 13479, 'CM Silom grab 2026-09-05'),
    (275, 13274, 13261, 'CM Silom grab 2026-09-06'),
    (362, 13637, 13638, 'CM Future Park card 2026-09-12'),
    (293, 13361, 13362, 'CM Ekkamai card 2026-09-07 — 재연결 후에도 카드 밴드(≤8%) 밖일 수 있음'),
    (422, 13761, 14030, 'CM MBK grab 2026-09-12 — #13873 대비 #14030 우선')
)
SELECT
  p.settlement_id,
  p.note,
  pcs.store_code,
  pcs.settle_date,
  pcs.channel,
  pcs.gross_amt,
  pcs.net_amt AS old_net,
  pcs.fee_amt AS old_fee,
  ROUND((pcs.fee_amt / NULLIF(pcs.gross_amt, 0)) * 1000) / 10.0 AS old_fee_pct,
  pcs.bank_transaction_id AS current_bank_id,
  p.old_bank_id AS expected_old_bank_id,
  (pcs.bank_transaction_id = p.old_bank_id) AS still_wrong_link,
  p.new_bank_id,
  ROUND(ABS(COALESCE(nbt.amount, 0))::numeric, 2) AS new_net,
  ROUND((pcs.gross_amt - ABS(COALESCE(nbt.amount, 0)))::numeric, 2) AS new_fee,
  ROUND(
    ((pcs.gross_amt - ABS(COALESCE(nbt.amount, 0))) / NULLIF(pcs.gross_amt, 0)) * 1000
  ) / 10.0 AS new_fee_pct,
  left(COALESCE(nbt.memo, nbt.note, ''), 80) AS new_bank_memo,
  (
    SELECT o.id
    FROM public.pos_channel_settlements o
    WHERE o.bank_transaction_id = p.new_bank_id
      AND o.id <> p.settlement_id
    LIMIT 1
  ) AS new_bank_already_linked_settlement_id,
  pcs.journal_entry_id,
  pcs.fee_source
FROM plan p
JOIN public.pos_channel_settlements pcs ON pcs.id = p.settlement_id
LEFT JOIN public.bank_transactions nbt ON nbt.id = p.new_bank_id
ORDER BY p.settlement_id;
