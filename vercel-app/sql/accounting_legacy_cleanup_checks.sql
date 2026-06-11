-- =============================================================================
-- 레거시·이중 위험 점검 (방콕 trans_date 기준) — Supabase SQL Editor에 통째로 붙여넣기
-- trans_date / settle_date 는 text(YYYY-MM-DD) → left(trim(...), 10)::date 로 비교
-- ★ 아래 end_date 한 줄만 바꾼 뒤 Run
-- =============================================================================

WITH params AS (
  SELECT DATE '2026-06-11' AS end_date  -- ← 마감일 (방콕)
),
pos_channel_memo AS (
  SELECT '(grab|grabtaxi|line\s*pay|linepay|line\s*man|lineman|shopee|shopeepay|food\s*panda|foodpanda|robinhood|delivery|visa|master|mastercard|unionpay|jcb|card|credit|qr|promptpay|truemoney|판매대금|qr결제|배달|카드)'::text AS pattern
),

-- 1) POS 이중 매출 위험 입금 (revenue_* + POS 완료 주문 매장)
c1_pos_revenue_double AS (
  SELECT
    bt.id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    bt.amount,
    bt.category,
    COALESCE(bt.store, bt.store_name, '') AS store_name,
    bt.memo
  FROM public.bank_transactions bt
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit'
    AND bt.category IN ('revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash')
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND EXISTS (
      SELECT 1 FROM public.pos_orders po
      WHERE po.store_code = COALESCE(bt.store, '')
        AND po.status IN ('completed', 'paid', 'ready')
      LIMIT 1
    )
),

-- 2) receivable_receive + 채널 정산 동일 통장 (충돌)
c2_recv_and_settlement AS (
  SELECT
    bt.id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    bt.amount,
    bt.category,
    COALESCE(bt.store_name, bt.store, '') AS store_name,
    bt.memo,
    array_agg(pcs.id ORDER BY pcs.id) AS settlement_ids
  FROM public.bank_transactions bt
  JOIN public.pos_channel_settlements pcs ON pcs.bank_transaction_id = bt.id
  WHERE bt.category = 'receivable_receive'
    AND bt.trans_type = 'deposit'
  GROUP BY bt.id, bt.trans_date, bt.amount, bt.category, bt.store_name, bt.store, bt.memo
),

-- 3) 미완료 채널 정산 (분개 또는 통장 미연결)
c3_pending_settlement AS (
  SELECT
    pcs.id,
    left(trim(pcs.settle_date::text), 10) AS trans_date,
    pcs.net_amt AS amount,
    pcs.channel AS category,
    pcs.store_code AS store_name,
    format('gross=%s fee=%s bank_id=%s journal_id=%s',
      pcs.gross_amt, pcs.fee_amt, pcs.bank_transaction_id, pcs.journal_entry_id) AS memo
  FROM public.pos_channel_settlements pcs
  CROSS JOIN params p
  WHERE left(trim(pcs.settle_date::text), 10)::date <= p.end_date
    AND (pcs.journal_entry_id IS NULL OR pcs.bank_transaction_id IS NULL)
),

-- 4) 매장별 미수 잔액 음수 (수금 초과 의심)
c4_negative_balance AS (
  SELECT
    NULL::bigint AS id,
    NULL::text AS trans_date,
    SUM(rt.amount) AS amount,
    'balance'::text AS category,
    rt.store_name,
    format('누적 미수 잔액 %s', ROUND(SUM(rt.amount)::numeric, 2)) AS memo
  FROM public.receivable_transactions rt
  CROSS JOIN params p
  WHERE left(trim(rt.trans_date::text), 10)::date <= p.end_date
  GROUP BY rt.store_name
  HAVING SUM(rt.amount) < -0.01
),

-- 5) POS 채널 입금인데 본사 B2B 미수금(Receive) 보조원장이 잘못 생성된 건
c5_pos_recv_subledger AS (
  SELECT
    rt.id,
    left(trim(rt.trans_date::text), 10) AS trans_date,
    rt.amount,
    bt.category,
    rt.store_name,
    COALESCE(bt.memo, rt.memo, '') AS memo,
    bt.id AS bank_id
  FROM public.receivable_transactions rt
  JOIN public.bank_transactions bt ON bt.id = rt.bank_transaction_id
  CROSS JOIN params p
  CROSS JOIN pos_channel_memo pcm
  WHERE rt.ref_type = 'Receive'
    AND bt.trans_type = 'deposit'
    AND bt.category = 'receivable_receive'
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND bt.memo ~* pcm.pattern
    AND EXISTS (
      SELECT 1 FROM public.pos_orders po
      WHERE po.status IN ('completed', 'paid', 'ready')
        AND (
          po.store_code = rt.store_name
          OR po.store_code = regexp_replace(rt.store_name, '^CM ', '')
          OR po.store_code = 'CM ' || regexp_replace(rt.store_name, '^CM ', '')
        )
      LIMIT 1
    )
),

-- 통합 결과 (section 순 → 날짜 내림차순)
unified AS (
  SELECT
    1 AS section,
    'POS revenue_* 이중 매출 위험 입금'::text AS check_name,
    c.id AS ref_id,
    NULL::bigint AS ref_id2,
    c.trans_date,
    c.store_name,
    c.amount,
    c.category,
    c.memo,
    NULL::text AS detail
  FROM c1_pos_revenue_double c

  UNION ALL

  SELECT
    2,
    'receivable_receive + 채널정산 충돌',
    c.id,
    NULL,
    c.trans_date,
    c.store_name,
    c.amount,
    c.category,
    c.memo,
    array_to_string(c.settlement_ids, ',')
  FROM c2_recv_and_settlement c

  UNION ALL

  SELECT
    3,
    '미완료 채널 정산',
    c.id,
    NULL,
    c.trans_date,
    c.store_name,
    c.amount,
    c.category,
    c.memo,
    NULL
  FROM c3_pending_settlement c

  UNION ALL

  SELECT
    4,
    '미수 잔액 음수(수금 초과)',
    c.id,
    NULL,
    c.trans_date,
    c.store_name,
    c.amount,
    c.category,
    c.memo,
    NULL
  FROM c4_negative_balance c

  UNION ALL

  SELECT
    5,
    'POS채널입금→본사미수 Receive 오연결',
    c.id,
    c.bank_id,
    c.trans_date,
    c.store_name,
    c.amount,
    c.category,
    c.memo,
    format('bank_id=%s', c.bank_id)
  FROM c5_pos_recv_subledger c
),

summary AS (
  SELECT
    section,
    check_name,
    COUNT(*)::bigint AS row_count
  FROM unified
  GROUP BY section, check_name
)

-- ── 결과 1: 건수 요약 (section 0)
SELECT
  0 AS section,
  '【요약】'::text AS check_name,
  NULL::bigint AS ref_id,
  NULL::bigint AS ref_id2,
  NULL::text AS trans_date,
  NULL::text AS store_name,
  s.row_count AS amount,
  NULL::text AS category,
  s.check_name AS memo,
  format('%s건', s.row_count) AS detail
FROM summary s

UNION ALL

-- ── 결과 2: 상세 목록
SELECT
  u.section,
  u.check_name,
  u.ref_id,
  u.ref_id2,
  u.trans_date,
  u.store_name,
  u.amount,
  u.category,
  u.memo,
  u.detail
FROM unified u

ORDER BY section, trans_date DESC NULLS LAST, ref_id DESC NULLS LAST;


-- =============================================================================
-- (선택) §5 오연결 Receive 정리 — 위 결과 확인·백업 후, end_date 맞춰 Run
-- =============================================================================
/*
WITH params AS (SELECT DATE '2026-06-11' AS end_date),
pos_channel_memo AS (
  SELECT '(grab|grabtaxi|line\s*pay|linepay|line\s*man|lineman|shopee|shopeepay|food\s*panda|foodpanda|robinhood|delivery|visa|master|mastercard|unionpay|jcb|card|credit|qr|promptpay|truemoney|판매대금|qr결제|배달|카드)'::text AS pattern
)
DELETE FROM public.receivable_transactions rt
USING public.bank_transactions bt, params p, pos_channel_memo pcm
WHERE rt.bank_transaction_id = bt.id
  AND rt.ref_type = 'Receive'
  AND bt.trans_type = 'deposit'
  AND bt.category = 'receivable_receive'
  AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
  AND bt.memo ~* pcm.pattern
  AND EXISTS (
    SELECT 1 FROM public.pos_orders po
    WHERE po.status IN ('completed', 'paid', 'ready')
      AND (
        po.store_code = rt.store_name
        OR po.store_code = regexp_replace(rt.store_name, '^CM ', '')
        OR po.store_code = 'CM ' || regexp_replace(rt.store_name, '^CM ', '')
      )
    LIMIT 1
  );
*/
