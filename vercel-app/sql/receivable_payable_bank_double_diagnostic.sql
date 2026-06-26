-- =============================================================================
-- 가맹 수금(통장 입금·매출 수령) vs 본사 미지급(통장 출금·매입 대금) 이중 의심 점검
--
-- 증상 예:
--   - K-bank 입금: 매출 수령 + CM MBK 등 → 미수금 ✓
--   - 미지급: S&J GLOBAL(본사) 지급, 메모 "통장 지급: Transfer Withdrawal | To X0790 ..."
--
-- 원리:
--   payable Payment 의 "통장 지급:" 은 bank_transactions.trans_type = 'withdraw' + purchase_payment 에만 생성됨.
--   receivable Receive 의 "통장 수령:" 은 deposit + receivable_receive.
--   같은 날·같은 금액이면 "한 돈의 입금·출금 양쪽"이 각각 잡혔는지 본 쿼리로 대조합니다.
--
-- Supabase SQL Editor — params 블록만 수정 후 Run
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-04-08' AS start_date,
    DATE '2026-04-08' AS end_date,
    NULL::bigint AS account_id_filter,  -- K-bank만 보려면 bank_accounts.id 입력, NULL=전체 계좌
    '%X0790%'::text AS memo_to_account, -- 수취 계좌 힌트 (없으면 NULL)
    '%Transfer Withdrawal%'::text AS memo_withdraw_pattern
),

hq_vendors AS (
  SELECT
    lower(trim(v.code)) AS vendor_code_lc,
    trim(v.code) AS vendor_code,
    trim(v.name) AS vendor_name,
    trim(COALESCE(v.type, '')) AS vendor_type
  FROM public.vendors v
  WHERE lower(trim(COALESCE(v.code, ''))) = 'hq'
     OR lower(trim(COALESCE(v.type, ''))) IN ('본사', 'head office', 'hq')
     OR lower(trim(COALESCE(v.type, ''))) LIKE '%본사%'
     OR lower(trim(COALESCE(v.type, ''))) LIKE '%head office%'
     OR lower(COALESCE(v.name, '') || ' ' || COALESCE(v.gps_name, '')) ~* '\(head office\)|\(본사\)'
),

-- (1) 미지급 Payment — 통장 지급 / Transfer Withdrawal / 본사 거래처
payable_bank_payments AS (
  SELECT
    pt.id AS payable_id,
    pt.bank_transaction_id AS bank_id,
    left(trim(pt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(pt.amount, 0))::numeric AS amount_abs,
    trim(pt.vendor_code) AS payable_vendor_code,
    v.name AS payable_vendor_name,
    left(COALESCE(pt.memo, ''), 200) AS payable_memo,
    (hv.vendor_code IS NOT NULL) AS is_hq_vendor
  FROM public.payable_transactions pt
  LEFT JOIN public.vendors v ON lower(trim(v.code)) = lower(trim(pt.vendor_code))
  LEFT JOIN hq_vendors hv ON lower(trim(pt.vendor_code)) = hv.vendor_code_lc
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND pt.bank_transaction_id IS NOT NULL
    AND left(trim(pt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(pt.trans_date::text), 10)::date <= p.end_date
    AND (
      pt.memo ILIKE '통장 지급%'
      OR (p.memo_withdraw_pattern IS NOT NULL AND pt.memo ILIKE p.memo_withdraw_pattern)
      OR (p.memo_to_account IS NOT NULL AND pt.memo ILIKE p.memo_to_account)
      OR hv.vendor_code IS NOT NULL
    )
),

-- (2) 연결된 통장 출금 상세
linked_bank_withdrawals AS (
  SELECT
    pbp.*,
    bt.trans_type AS bank_trans_type,
    bt.category AS bank_category,
    trim(bt.vendor_code) AS bank_vendor_code,
    trim(COALESCE(bt.store_name, bt.store, '')) AS bank_store_name,
    left(COALESCE(bt.memo, ''), 200) AS bank_memo,
    bt.account_id,
    ba.name AS account_name,
    ba.bank_name,
    ba.store AS account_store
  FROM payable_bank_payments pbp
  JOIN public.bank_transactions bt ON bt.id = pbp.bank_id
  LEFT JOIN public.bank_accounts ba ON ba.id = bt.account_id
  CROSS JOIN params p
  WHERE p.account_id_filter IS NULL OR bt.account_id = p.account_id_filter
),

-- (3) 통장 입금 — 매출 수령 (미수금 연동)
recv_bank_deposits AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
    trim(COALESCE(bt.store_name, bt.store, '')) AS store_name,
    bt.category,
    left(COALESCE(bt.memo, ''), 200) AS bank_memo,
    bt.account_id,
    ba.name AS account_name,
    ba.bank_name,
    ba.store AS account_store,
    rt.id AS receivable_id,
    left(COALESCE(rt.memo, ''), 120) AS receivable_memo
  FROM public.bank_transactions bt
  LEFT JOIN public.bank_accounts ba ON ba.id = bt.account_id
  LEFT JOIN public.receivable_transactions rt
    ON rt.bank_transaction_id = bt.id AND rt.ref_type = 'Receive'
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit'
    AND bt.category = 'receivable_receive'
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND (p.account_id_filter IS NULL OR bt.account_id = p.account_id_filter)
),

-- (4) 같은 날·같은 금액 — 미지급 지급 ↔ 미수금 입금 대조
amount_cross_match AS (
  SELECT
    w.payable_id,
    w.bank_id AS withdraw_bank_id,
    w.account_name AS withdraw_account,
    w.bank_trans_type,
    w.bank_category,
    w.is_hq_vendor,
    w.payable_vendor_name,
    w.amount_abs,
    w.trans_date,
    left(w.payable_memo, 120) AS payable_memo,
    left(w.bank_memo, 120) AS withdraw_memo,
    d.bank_id AS deposit_bank_id,
    d.account_name AS deposit_account,
    d.store_name AS receivable_store,
    left(d.bank_memo, 120) AS deposit_memo,
    d.receivable_id,
    CASE
      WHEN w.bank_trans_type <> 'withdraw' THEN 'ERR:미지급이 입금 통장에 연결됨'
      WHEN w.bank_category = 'purchase_payment' AND w.is_hq_vendor THEN '의심:본사매입대금↔가맹수금 동일금액'
      WHEN w.bank_category = 'transfer' THEN '이체(미지급 없어야 정상)'
      ELSE '확인:용도·계좌 대조'
    END AS diagnosis
  FROM linked_bank_withdrawals w
  JOIN recv_bank_deposits d
    ON d.trans_date = w.trans_date
   AND d.amount_abs = w.amount_abs
),

-- (5) 이상: Payment 가 deposit 통장에 연결 (데이터 오류)
payable_on_deposit AS (
  SELECT
    pbp.payable_id,
    pbp.bank_id,
    bt.trans_type,
    bt.category,
    abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
    left(COALESCE(bt.memo, ''), 120) AS bank_memo,
    ba.name AS account_name
  FROM payable_bank_payments pbp
  JOIN public.bank_transactions bt ON bt.id = pbp.bank_id
  LEFT JOIN public.bank_accounts ba ON ba.id = bt.account_id
  WHERE bt.trans_type <> 'withdraw'
),

-- (6) 고아: bank_id 없거나 통장 행 삭제됨
orphan_payable AS (
  SELECT
    pt.id AS payable_id,
    pt.bank_transaction_id AS bank_id,
    left(trim(pt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(pt.amount, 0))::numeric AS amount_abs,
    left(COALESCE(pt.memo, ''), 120) AS payable_memo
  FROM public.payable_transactions pt
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND pt.bank_transaction_id IS NOT NULL
    AND left(trim(pt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(pt.trans_date::text), 10)::date <= p.end_date
    AND pt.memo ILIKE '통장 지급%'
    AND NOT EXISTS (
      SELECT 1 FROM public.bank_transactions bt WHERE bt.id = pt.bank_transaction_id
    )
)

-- =============================================================================
-- 결과 A: 요약 (먼저 이 블록만 실행해도 됨)
-- =============================================================================
SELECT 0 AS sort_key, '【요약】기간' AS section, (SELECT start_date::text || '~' || end_date::text FROM params) AS detail
UNION ALL
SELECT 1, '미지급·통장지급·본사거래처 Payment', COUNT(*)::text FROM payable_bank_payments
UNION ALL
SELECT 2, '  └ 연결 통장 출금(purchase_payment)', COUNT(*)::text
FROM linked_bank_withdrawals WHERE bank_trans_type = 'withdraw' AND bank_category = 'purchase_payment'
UNION ALL
SELECT 3, '  └ 연결 통장 이체(transfer)', COUNT(*)::text
FROM linked_bank_withdrawals WHERE bank_category = 'transfer'
UNION ALL
SELECT 4, '매출수령 입금(receivable_receive)', COUNT(*)::text FROM recv_bank_deposits
UNION ALL
SELECT 5, '동일일·동일금액 입금↔출금 대조', COUNT(*)::text FROM amount_cross_match
UNION ALL
SELECT 6, '  └ 본사매입대금 의심 쌍', COUNT(*)::text
FROM amount_cross_match WHERE diagnosis LIKE '의심:%'
UNION ALL
SELECT 7, 'Payment가 입금통장에 연결(오류)', COUNT(*)::text FROM payable_on_deposit
UNION ALL
SELECT 8, '고아 Payment(통장행 없음)', COUNT(*)::text FROM orphan_payable
ORDER BY sort_key;

-- =============================================================================
-- 결과 B: 미지급 지급 + 연결 통장 출금 (Transfer Withdrawal / X0790)
-- =============================================================================
/*
SELECT
  payable_id,
  bank_id,
  trans_date,
  amount_abs,
  is_hq_vendor,
  payable_vendor_code,
  payable_vendor_name,
  bank_trans_type,
  bank_category,
  account_id,
  account_name,
  bank_name,
  account_store,
  payable_memo,
  bank_memo
FROM linked_bank_withdrawals
ORDER BY trans_date, amount_abs DESC, payable_id;
*/

-- =============================================================================
-- 결과 C: 매출 수령 입금 (미수금)
-- =============================================================================
/*
SELECT
  bank_id,
  trans_date,
  amount_abs,
  store_name,
  account_name,
  bank_name,
  receivable_id,
  bank_memo,
  receivable_memo
FROM recv_bank_deposits
ORDER BY trans_date, amount_abs DESC, store_name;
*/

-- =============================================================================
-- 결과 D: ★ 동일 날·동일 금액 — 가맹 수금 입금 vs 본사 지급 출금 (이중 의심)
-- diagnosis = '의심:본사매입대금↔가맹수금 동일금액' 인 행이 문제 후보
-- =============================================================================
/*
SELECT *
FROM amount_cross_match
ORDER BY trans_date, amount_abs DESC, payable_id;
*/

-- =============================================================================
-- 결과 E: 통장 전체 — 적요에 X0790 / Transfer Withdrawal (계좌 구분)
-- =============================================================================
/*
SELECT
  bt.id AS bank_id,
  left(trim(bt.trans_date::text), 10) AS trans_date,
  bt.trans_type,
  bt.category,
  abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
  trim(COALESCE(bt.store_name, bt.store, '')) AS store_name,
  trim(bt.vendor_code) AS vendor_code,
  ba.id AS account_id,
  ba.name AS account_name,
  ba.bank_name,
  left(COALESCE(bt.memo, ''), 160) AS memo,
  EXISTS (SELECT 1 FROM public.payable_transactions pt WHERE pt.bank_transaction_id = bt.id AND pt.ref_type = 'Payment') AS has_payable,
  EXISTS (SELECT 1 FROM public.receivable_transactions rt WHERE rt.bank_transaction_id = bt.id AND rt.ref_type = 'Receive') AS has_receivable
FROM public.bank_transactions bt
LEFT JOIN public.bank_accounts ba ON ba.id = bt.account_id
CROSS JOIN params p
WHERE left(trim(bt.trans_date::text), 10)::date >= p.start_date
  AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
  AND (
    (p.memo_to_account IS NOT NULL AND bt.memo ILIKE p.memo_to_account)
    OR (p.memo_withdraw_pattern IS NOT NULL AND bt.memo ILIKE p.memo_withdraw_pattern)
    OR bt.memo ILIKE '%S&J GLOBAL%'
  )
  AND (p.account_id_filter IS NULL OR bt.account_id = p.account_id_filter)
ORDER BY bt.trans_type, amount_abs DESC, bt.id;
*/

-- =============================================================================
-- 결과 F: K-bank만 — 해당 일자 입금·출금 전체 (account_id_filter 에 K-bank id 넣고 실행)
-- =============================================================================
/*
SELECT
  bt.id,
  bt.trans_type,
  bt.category,
  abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
  trim(COALESCE(bt.store_name, bt.store, '')) AS store_name,
  trim(bt.vendor_code) AS vendor_code,
  left(COALESCE(bt.memo, ''), 160) AS memo
FROM public.bank_transactions bt
CROSS JOIN params p
WHERE left(trim(bt.trans_date::text), 10)::date >= p.start_date
  AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
  AND bt.account_id = p.account_id_filter
ORDER BY bt.trans_type DESC, abs(bt.amount) DESC, bt.id;
*/

-- =============================================================================
-- 계좌 id 확인
-- =============================================================================
/*
SELECT id, name, bank_name, store, opening_balance_date
FROM public.bank_accounts
ORDER BY id;
*/

-- =============================================================================
-- 결과 G: 의심 쌍 — 출금 계좌(매장) vs 입금 계좌(HQ) 구분
-- (요약 6번 > 0 이면 실행 — 가맹 K-bank 출금 + HQ K-bank 입금 이중 패턴)
-- =============================================================================
/*
WITH params AS (
  SELECT DATE '2026-04-08' AS start_date, DATE '2026-04-08' AS end_date
),
hq_vendors AS (
  SELECT lower(trim(v.code)) AS vendor_code_lc
  FROM public.vendors v
  WHERE lower(trim(COALESCE(v.code, ''))) = 'hq'
     OR lower(trim(COALESCE(v.type, ''))) IN ('본사', 'head office', 'hq')
     OR lower(COALESCE(v.name, '') || ' ' || COALESCE(v.gps_name, '')) ~* '\(head office\)|\(본사\)'
),
pay_w AS (
  SELECT
    pt.id AS payable_id,
    bt.id AS withdraw_bank_id,
    abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    bt.category,
    ba.id AS account_id,
    ba.name AS account_no,
    ba.store AS account_store,
    left(COALESCE(bt.memo, ''), 100) AS withdraw_memo
  FROM public.payable_transactions pt
  JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  JOIN hq_vendors hv ON lower(trim(pt.vendor_code)) = hv.vendor_code_lc
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND bt.trans_type = 'withdraw'
    AND bt.category = 'purchase_payment'
    AND left(trim(bt.trans_date::text), 10)::date = p.start_date
),
dep_d AS (
  SELECT
    bt.id AS deposit_bank_id,
    abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    trim(COALESCE(bt.store_name, bt.store, '')) AS receivable_store,
    ba.id AS account_id,
    ba.name AS account_no,
    ba.store AS account_store,
    left(COALESCE(bt.memo, ''), 100) AS deposit_memo
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit'
    AND bt.category = 'receivable_receive'
    AND left(trim(bt.trans_date::text), 10)::date = p.start_date
)
SELECT
  w.payable_id,
  w.withdraw_bank_id,
  w.amount_abs,
  w.account_id AS withdraw_account_id,
  w.account_store AS withdraw_from_store,
  w.account_no AS withdraw_account_no,
  d.deposit_bank_id,
  d.receivable_store,
  d.account_id AS deposit_account_id,
  d.account_store AS deposit_on_store,
  d.account_no AS deposit_account_no,
  '매장출금 매입대금→본사 + HQ입금 매출수령' AS fix_hint
FROM pay_w w
JOIN dep_d d ON d.trans_date = w.trans_date AND d.amount_abs = w.amount_abs
ORDER BY w.amount_abs DESC;
*/

-- =============================================================================
-- 결과 H: 수정 대상 출금만 (통장 화면에서 용도→이체, 거래처 제거)
-- =============================================================================
/*
WITH params AS (
  SELECT DATE '2026-04-08' AS start_date, DATE '2026-04-08' AS end_date
),
hq_vendors AS (
  SELECT lower(trim(v.code)) AS vendor_code_lc
  FROM public.vendors v
  WHERE lower(trim(COALESCE(v.code, ''))) = 'hq'
     OR lower(trim(COALESCE(v.type, ''))) IN ('본사', 'head office', 'hq')
     OR lower(COALESCE(v.name, '') || ' ' || COALESCE(v.gps_name, '')) ~* '\(head office\)|\(본사\)'
)
SELECT
  bt.id AS bank_id_to_fix,
  pt.id AS payable_id_to_drop,
  ba.store AS from_store_account,
  ba.name AS account_no,
  abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
  trim(bt.vendor_code) AS vendor_code,
  left(COALESCE(bt.memo, ''), 120) AS memo
FROM public.bank_transactions bt
JOIN public.payable_transactions pt ON pt.bank_transaction_id = bt.id AND pt.ref_type = 'Payment'
JOIN public.bank_accounts ba ON ba.id = bt.account_id
JOIN hq_vendors hv ON lower(trim(pt.vendor_code)) = hv.vendor_code_lc
CROSS JOIN params p
WHERE bt.trans_type = 'withdraw'
  AND bt.category = 'purchase_payment'
  AND left(trim(bt.trans_date::text), 10)::date = p.start_date
  AND lower(trim(COALESCE(ba.store, ''))) <> 'hq'
ORDER BY ba.store, amount_abs DESC;
*/

-- =============================================================================
-- 결과 I: 고아 Payment 2건 (통장 행 삭제됐으나 미지급만 남음)
-- =============================================================================
/*
WITH params AS (
  SELECT DATE '2026-04-08' AS start_date, DATE '2026-04-08' AS end_date
)
SELECT
  pt.id AS payable_id,
  pt.bank_transaction_id AS missing_bank_id,
  abs(COALESCE(pt.amount, 0))::numeric AS amount_abs,
  trim(pt.vendor_code) AS vendor_code,
  left(COALESCE(pt.memo, ''), 160) AS payable_memo
FROM public.payable_transactions pt
CROSS JOIN params p
WHERE pt.ref_type = 'Payment'
  AND pt.bank_transaction_id IS NOT NULL
  AND left(trim(pt.trans_date::text), 10)::date = p.start_date
  AND pt.memo ILIKE '통장 지급%'
  AND NOT EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.id = pt.bank_transaction_id)
ORDER BY pt.id;
*/

-- =============================================================================
-- 결과 J: 기간별 — 이중 의심 쌍이 있는 날만 (4월 8일만인지 확인)
-- params 의 start_date/end_date 를 넓히고(예: 2026-01-01~2026-06-30) 이 블록만 실행
-- =============================================================================
/*
WITH params AS (
  SELECT
    DATE '2026-01-01' AS start_date,
    DATE '2026-06-30' AS end_date
),
hq_vendors AS (
  SELECT lower(trim(v.code)) AS vendor_code_lc
  FROM public.vendors v
  WHERE lower(trim(COALESCE(v.code, ''))) = 'hq'
     OR lower(trim(COALESCE(v.type, ''))) IN ('본사', 'head office', 'hq')
     OR lower(COALESCE(v.name, '') || ' ' || COALESCE(v.gps_name, '')) ~* '\(head office\)|\(본사\)'
),
pay_w AS (
  SELECT
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
    bt.id AS withdraw_bank_id
  FROM public.payable_transactions pt
  JOIN public.bank_transactions bt ON bt.id = pt.bank_transaction_id
  JOIN hq_vendors hv ON lower(trim(pt.vendor_code)) = hv.vendor_code_lc
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND bt.trans_type = 'withdraw'
    AND bt.category = 'purchase_payment'
    AND lower(trim(COALESCE(ba.store, ''))) <> 'hq'
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
),
dep_d AS (
  SELECT
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
    bt.id AS deposit_bank_id
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit'
    AND bt.category = 'receivable_receive'
    AND lower(trim(COALESCE(ba.store, ''))) = 'hq'
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
),
pairs AS (
  SELECT w.trans_date, w.amount_abs, w.withdraw_bank_id, d.deposit_bank_id
  FROM pay_w w
  JOIN dep_d d ON d.trans_date = w.trans_date AND d.amount_abs = w.amount_abs
),
by_day AS (
  SELECT
    trans_date,
    COUNT(*)::bigint AS suspect_pair_cnt,
    ROUND(SUM(amount_abs)::numeric, 2) AS suspect_amount_sum,
    array_agg(DISTINCT withdraw_bank_id ORDER BY withdraw_bank_id) AS withdraw_bank_ids,
    array_agg(DISTINCT deposit_bank_id ORDER BY deposit_bank_id) AS deposit_bank_ids
  FROM pairs
  GROUP BY trans_date
),
hq_recv_only AS (
  SELECT left(trim(bt.trans_date::text), 10) AS trans_date, COUNT(*)::bigint AS cnt
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit' AND bt.category = 'receivable_receive'
    AND lower(trim(COALESCE(ba.store, ''))) = 'hq'
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
  GROUP BY 1
),
store_pay_only AS (
  SELECT left(trim(bt.trans_date::text), 10) AS trans_date, COUNT(*)::bigint AS cnt
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  JOIN hq_vendors hv ON lower(trim(bt.vendor_code)) = hv.vendor_code_lc
  CROSS JOIN params p
  WHERE bt.trans_type = 'withdraw' AND bt.category = 'purchase_payment'
    AND lower(trim(COALESCE(ba.store, ''))) <> 'hq'
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
  GROUP BY 1
)
SELECT
  COALESCE(b.trans_date, h.trans_date, s.trans_date) AS trans_date,
  COALESCE(b.suspect_pair_cnt, 0) AS double_booked_pairs,
  COALESCE(b.suspect_amount_sum, 0) AS double_booked_amount,
  COALESCE(h.cnt, 0) AS hq_receivable_receive_cnt,
  COALESCE(s.cnt, 0) AS store_hq_purchase_payment_cnt,
  CASE
    WHEN COALESCE(b.suspect_pair_cnt, 0) > 0 THEN '★ 입금·출금 동시(이중)'
    WHEN COALESCE(h.cnt, 0) > 0 AND COALESCE(s.cnt, 0) = 0 THEN 'HQ 매출수령만'
    WHEN COALESCE(s.cnt, 0) > 0 AND COALESCE(h.cnt, 0) = 0 THEN '매장 매입대금만'
    ELSE '—'
  END AS day_pattern
FROM by_day b
FULL OUTER JOIN hq_recv_only h ON h.trans_date = b.trans_date
FULL OUTER JOIN store_pay_only s ON s.trans_date = COALESCE(b.trans_date, h.trans_date)
WHERE COALESCE(b.suspect_pair_cnt, 0) > 0
   OR COALESCE(h.cnt, 0) > 0
   OR COALESCE(s.cnt, 0) > 0
ORDER BY trans_date DESC;
*/

-- =============================================================================
-- 정리 참고
-- 1) 매장 K-bank 출금(purchase_payment·본사거래처) → 통장에서 「이체」+ 거래처 제거
--    → payable Payment 자동 삭제 (updateBankTransaction)
-- 2) HQ K-bank(id=9, 166-2-97079-0) 입금 매출수령 → 유지 + 미수 연결
-- 3) 고아 Payment(I 블록) → bank 행 없으면 DELETE 만 허용
--
-- DELETE FROM public.payable_transactions WHERE id IN (...);  -- I 블록 payable_id
-- =============================================================================
