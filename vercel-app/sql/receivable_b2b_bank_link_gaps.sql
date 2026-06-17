-- =============================================================================
-- POS 매장 B2B 수금 미연동 점검 — receivable_receive 인데 Receive 보조원장 없음
-- (CM Bangna โอนเงินมัดจำ 유형 — 채널 정산 적요가 아닌 이체 수금)
-- Supabase SQL Editor에 통째로 붙여넣기 → start_date / end_date 만 수정 후 Run
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-01-01' AS start_date,  -- ← 조회 시작
    DATE '2026-12-31' AS end_date     -- ← 조회 종료 (방콕 trans_date)
),
pos_stores AS (
  SELECT DISTINCT lower(regexp_replace(trim(o.store_code), '^cm\s+', '', 'i')) AS store_norm
  FROM public.pos_orders o
  WHERE lower(trim(COALESCE(o.status, ''))) IN ('completed', 'paid', 'ready')
    AND trim(COALESCE(o.store_code, '')) <> ''
),
recv_bank AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS amount,
    trim(COALESCE(bt.store_name, bt.store, '')) AS store_name,
    bt.memo,
    lower(regexp_replace(trim(COALESCE(bt.store_name, bt.store, '')), '^cm\s+', '', 'i')) AS store_norm
  FROM public.bank_transactions bt
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit'
    AND bt.category = 'receivable_receive'
    AND trim(COALESCE(bt.store_name, bt.store, '')) <> ''
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
),
gaps AS (
  SELECT
    rb.bank_id,
    rb.trans_date,
    rb.amount,
    rb.store_name,
    rb.memo,
    (ps.store_norm IS NOT NULL) AS is_pos_store
  FROM recv_bank rb
  LEFT JOIN pos_stores ps ON ps.store_norm = rb.store_norm
  WHERE NOT EXISTS (
    SELECT 1 FROM public.receivable_transactions rt
    WHERE rt.bank_transaction_id = rb.bank_id AND rt.ref_type = 'Receive'
  )
  AND NOT EXISTS (
    SELECT 1 FROM public.pos_channel_settlements pcs
    WHERE pcs.bank_transaction_id = rb.bank_id
  )
  AND COALESCE(rb.memo, '') !~* '(grab|grabtaxi|line\s*pay|linepay|line\s*man|lineman|shopee|shopeepay|food\s*panda|foodpanda|robinhood|delivery|visa|master|mastercard|unionpay|jcb|card|credit|qr|promptpay|truemoney|판매대금|qr결제|배달|카드)'
),
summary AS (
  SELECT
    store_name,
    is_pos_store,
    COUNT(*)::bigint AS gap_count,
    ROUND(SUM(amount)::numeric, 2) AS gap_amount_sum
  FROM gaps
  GROUP BY store_name, is_pos_store
)

SELECT
  0 AS sort_key,
  '【요약】' || (SELECT start_date::text FROM params) || '~' || (SELECT end_date::text FROM params) AS store_name,
  NULL::boolean AS is_pos_store,
  COUNT(*)::bigint AS gap_count,
  ROUND(COALESCE(SUM(amount), 0)::numeric, 2) AS gap_amount_sum,
  NULL::bigint AS bank_id,
  NULL::text AS trans_date,
  NULL::numeric AS amount,
  NULL::text AS memo
FROM gaps

UNION ALL

SELECT
  1,
  s.store_name,
  s.is_pos_store,
  s.gap_count,
  s.gap_amount_sum,
  NULL,
  NULL,
  NULL,
  format('POS=%s', s.is_pos_store)
FROM summary s

UNION ALL

SELECT
  2,
  g.store_name,
  g.is_pos_store,
  NULL::bigint,
  NULL::numeric,
  g.bank_id,
  g.trans_date,
  g.amount,
  left(COALESCE(g.memo, ''), 120)
FROM gaps g

ORDER BY sort_key, is_pos_store DESC NULLS LAST, gap_amount_sum DESC NULLS LAST, trans_date DESC NULLS LAST;
