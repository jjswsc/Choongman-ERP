-- 레거시·이중 위험 점검 (방콕 trans_date 기준 — :end_date, :store_filter 는 실행 전 치환)
-- 예: end_date = '2026-05-31', store_filter = 'All' 또는 매장명

-- 1) POS 이중 매출 위험 입금 (revenue_* + 해당 매장 POS 완료 주문 존재)
SELECT bt.id, bt.trans_date, bt.amount, bt.category, bt.store, bt.memo
FROM public.bank_transactions bt
WHERE bt.trans_type = 'deposit'
  AND bt.category IN ('revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash')
  AND bt.trans_date <= DATE '2026-05-31' -- end_date
  AND EXISTS (
    SELECT 1 FROM public.pos_orders po
    WHERE po.store_code = COALESCE(bt.store, '')
      AND po.status IN ('completed', 'paid', 'ready')
    LIMIT 1
  )
ORDER BY bt.trans_date DESC
LIMIT 200;

-- 2) receivable_receive + 채널 정산 동일 통장
SELECT bt.id AS bank_id, bt.trans_date, bt.amount, bt.category, bt.store_name,
       array_agg(pcs.id) AS settlement_ids
FROM public.bank_transactions bt
JOIN public.pos_channel_settlements pcs ON pcs.bank_transaction_id = bt.id
WHERE bt.category = 'receivable_receive'
  AND bt.trans_type = 'deposit'
GROUP BY bt.id, bt.trans_date, bt.amount, bt.category, bt.store_name;

-- 3) 미완료 채널 정산 (분개 또는 통장 미연결)
SELECT id, store_code, settle_date, channel, gross_amt, net_amt, fee_amt,
       bank_transaction_id, journal_entry_id
FROM public.pos_channel_settlements
WHERE settle_date <= DATE '2026-05-31'
  AND (journal_entry_id IS NULL OR bank_transaction_id IS NULL)
ORDER BY settle_date DESC;

-- 4) 매장별 미수 잔액 음수 (수금 초과 의심)
SELECT store_name, SUM(amount) AS balance
FROM public.receivable_transactions
WHERE trans_date <= DATE '2026-05-31'
GROUP BY store_name
HAVING SUM(amount) < -0.01
ORDER BY balance;
