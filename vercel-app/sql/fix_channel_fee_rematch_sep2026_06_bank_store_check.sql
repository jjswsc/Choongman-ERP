-- 대체 후보 통장 매장 확인 — 이것만 복사 → Run
-- Silom/MBK 후보가 정말 그 매장 입금인지 확인합니다.

SELECT
  bt.id AS bank_id,
  COALESCE(bt.store_name, bt.store) AS bank_store,
  bt.trans_date,
  bt.sales_date,
  ROUND(ABS(COALESCE(bt.amount, 0))::numeric, 2) AS amt,
  bt.category,
  left(COALESCE(bt.memo, bt.note, ''), 100) AS memo,
  (
    SELECT o.id
    FROM public.pos_channel_settlements o
    WHERE o.bank_transaction_id = bt.id
    LIMIT 1
  ) AS linked_settlement_id
FROM public.bank_transactions bt
WHERE bt.id IN (13508, 13092, 12941, 12887, 13692, 13753, 13742, 13747, 13752, 13873, 13638, 13362)
ORDER BY bt.id;
