-- =============================================================================
-- 레거시·이중 위험 점검 — 후아막·시콘 전용 (방콕 trans_date 기준)
-- 대상: CM Huamak, CM Seacon Srinakarin (+ CM 접두 없는 별칭)
-- 기간: start_date ~ end_date (6월 통장 CSV 전환 이후만 보려면 start_date = 2026-06-01)
-- Supabase SQL Editor에 통째로 붙여넣기
-- ★ start_date · end_date 두 줄만 바꾼 뒤 Run
-- =============================================================================

WITH params AS (
  SELECT
    DATE '2026-06-01' AS start_date,  -- ← 조회 시작 (6월부터 문제 시 2026-06-01)
    DATE '2026-06-11' AS end_date       -- ← 마감일 (방콕)
),
target_stores AS (
  SELECT unnest(ARRAY[
    'CM Huamak',
    'Huamak',
    'CM Seacon Srinakarin',
    'Seacon Srinakarin'
  ])::text AS store_code
),
date_in_range AS (
  SELECT p.start_date, p.end_date
  FROM params p
),

-- 1) POS 이중 매출 위험 입금 — 아직 revenue_* 로 남은 건 (→ 매출 수령으로 바꿔야 함)
c1_pos_revenue_double AS (
  SELECT
    bt.id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    bt.amount,
    bt.category,
    COALESCE(bt.store_name, bt.store, '') AS store_name,
    bt.memo
  FROM public.bank_transactions bt
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit'
    AND bt.category IN ('revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash')
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND EXISTS (
      SELECT 1 FROM target_stores ts
      WHERE lower(regexp_replace(trim(COALESCE(bt.store_name, bt.store, '')), '^cm\s+', '', 'i'))
          = lower(regexp_replace(trim(ts.store_code), '^cm\s+', '', 'i'))
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
  CROSS JOIN params p
  WHERE bt.category = 'receivable_receive'
    AND bt.trans_type = 'deposit'
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND EXISTS (
      SELECT 1 FROM target_stores ts
      WHERE lower(regexp_replace(trim(COALESCE(bt.store_name, bt.store, pcs.store_code, '')), '^cm\s+', '', 'i'))
          = lower(regexp_replace(trim(ts.store_code), '^cm\s+', '', 'i'))
    )
  GROUP BY bt.id, bt.trans_date, bt.amount, bt.category, bt.store_name, bt.store, bt.memo
),

-- 3) 미완료 채널 정산
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
  WHERE left(trim(pcs.settle_date::text), 10)::date >= p.start_date
    AND left(trim(pcs.settle_date::text), 10)::date <= p.end_date
    AND (pcs.journal_entry_id IS NULL OR pcs.bank_transaction_id IS NULL)
    AND EXISTS (
      SELECT 1 FROM target_stores ts
      WHERE lower(regexp_replace(trim(pcs.store_code), '^cm\s+', '', 'i'))
          = lower(regexp_replace(trim(ts.store_code), '^cm\s+', '', 'i'))
    )
),

-- 4) 대상 매장 미수 잔액 음수 (§5 정리 전후 비교용 — start_date 이후 거래만 합산)
c4_negative_balance AS (
  SELECT
    NULL::bigint AS id,
    NULL::text AS trans_date,
    SUM(rt.amount) AS amount,
    'balance'::text AS category,
    rt.store_name,
    format('기간 내 미수 누적 %s', ROUND(SUM(rt.amount)::numeric, 2)) AS memo
  FROM public.receivable_transactions rt
  CROSS JOIN params p
  WHERE left(trim(rt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(rt.trans_date::text), 10)::date <= p.end_date
    AND EXISTS (
      SELECT 1 FROM target_stores ts
      WHERE lower(regexp_replace(trim(rt.store_name), '^cm\s+', '', 'i'))
          = lower(regexp_replace(trim(ts.store_code), '^cm\s+', '', 'i'))
    )
  GROUP BY rt.store_name
  HAVING SUM(rt.amount) < -0.01
),

-- 5) 매출 수령 → 본사 미수 Receive 오연결 (삭제 대상)
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
  WHERE rt.ref_type = 'Receive'
    AND bt.trans_type = 'deposit'
    AND bt.category = 'receivable_receive'
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND EXISTS (
      SELECT 1 FROM target_stores ts
      WHERE lower(regexp_replace(trim(rt.store_name), '^cm\s+', '', 'i'))
          = lower(regexp_replace(trim(ts.store_code), '^cm\s+', '', 'i'))
    )
),

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
    'POS매출수령→본사미수 Receive 오연결',
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

SELECT
  0 AS section,
  format('【요약】후아막·시콘 %s~%s', (SELECT start_date::text FROM params), (SELECT end_date::text FROM params))::text AS check_name,
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
-- (1) §5 삭제 전 건수·금액 미리보기 — start_date/end_date 맞춘 뒤 Run
-- =============================================================================
/*
WITH params AS (
  SELECT DATE '2026-06-01' AS start_date, DATE '2026-06-11' AS end_date
),
target_stores AS (
  SELECT unnest(ARRAY['CM Huamak','Huamak','CM Seacon Srinakarin','Seacon Srinakarin'])::text AS store_code
)
SELECT
  rt.store_name,
  COUNT(*) AS recv_rows,
  ROUND(SUM(rt.amount)::numeric, 2) AS recv_sum
FROM public.receivable_transactions rt
JOIN public.bank_transactions bt ON bt.id = rt.bank_transaction_id
CROSS JOIN params p
WHERE rt.ref_type = 'Receive'
  AND bt.trans_type = 'deposit'
  AND bt.category = 'receivable_receive'
  AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
  AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
  AND EXISTS (
    SELECT 1 FROM target_stores ts
    WHERE lower(regexp_replace(trim(rt.store_name), '^cm\s+', '', 'i'))
        = lower(regexp_replace(trim(ts.store_code), '^cm\s+', '', 'i'))
  )
GROUP BY rt.store_name
ORDER BY rt.store_name;
*/


-- =============================================================================
-- (2) §5 오연결 Receive 삭제 — (1) 확인·백업 후 주석 해제 Run
--     통장 분개(1010/1130)는 유지, receivable_transactions Receive 행만 제거
-- =============================================================================
/*
WITH params AS (
  SELECT DATE '2026-06-01' AS start_date, DATE '2026-06-11' AS end_date
),
target_stores AS (
  SELECT unnest(ARRAY['CM Huamak','Huamak','CM Seacon Srinakarin','Seacon Srinakarin'])::text AS store_code
)
DELETE FROM public.receivable_transactions rt
USING public.bank_transactions bt, params p
WHERE rt.bank_transaction_id = bt.id
  AND rt.ref_type = 'Receive'
  AND bt.trans_type = 'deposit'
  AND bt.category = 'receivable_receive'
  AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
  AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
  AND EXISTS (
    SELECT 1 FROM target_stores ts
    WHERE lower(regexp_replace(trim(rt.store_name), '^cm\s+', '', 'i'))
        = lower(regexp_replace(trim(ts.store_code), '^cm\s+', '', 'i'))
  );
*/


-- =============================================================================
-- (3) §1 revenue_* → 통장 UI에서 「매출 수령」으로 변경 필요 (bank_id 목록)
--     SQL로 category만 바꾸면 분개가 안 맞을 수 있음 — 통장 조회에서 저장 권장
-- =============================================================================
/*
WITH params AS (
  SELECT DATE '2026-06-01' AS start_date, DATE '2026-06-11' AS end_date
),
target_stores AS (
  SELECT unnest(ARRAY['CM Huamak','Huamak','CM Seacon Srinakarin','Seacon Srinakarin'])::text AS store_code
)
SELECT
  bt.id AS bank_id,
  left(trim(bt.trans_date::text), 10) AS trans_date,
  COALESCE(bt.store_name, bt.store, '') AS store_name,
  bt.category,
  bt.amount,
  bt.memo
FROM public.bank_transactions bt
CROSS JOIN params p
WHERE bt.trans_type = 'deposit'
  AND bt.category IN ('revenue_delivery', 'revenue_card', 'revenue_qr', 'revenue_cash')
  AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
  AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
  AND EXISTS (
    SELECT 1 FROM target_stores ts
    WHERE lower(regexp_replace(trim(COALESCE(bt.store_name, bt.store, '')), '^cm\s+', '', 'i'))
        = lower(regexp_replace(trim(ts.store_code), '^cm\s+', '', 'i'))
  )
ORDER BY trans_date DESC, bt.id DESC;
*/
