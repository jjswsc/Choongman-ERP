-- =============================================================================
-- 통장 매입대금(purchase_payment) ↔ 입고 배치 미연동 정리
--
-- 증상: 입고 관리에 품목 입고가 있는데 통장 매입(지급)이 별도로 잡혀 이중으로 보임
-- 원인: bank_transaction_inbound_links 없이 purchase_payment만 등록됨
--
-- 권장: Node 스크립트로 자동 연결 (FIFO)
--   cd vercel-app
--   node scripts/repair-bank-inbound-links.mjs --dry-run
--   node scripts/repair-bank-inbound-links.mjs --execute
--
-- 이 SQL은 【P1 미리보기】·【P3 검증】용. 복잡한 금액 배분은 스크립트가 처리합니다.
-- =============================================================================

-- =============================================================================
-- 【P1】 미연동 매입대금 + 매칭 가능 입고 배치 — 미리보기
-- =============================================================================
WITH params AS (
  SELECT
    DATE '2026-02-01' AS start_date,   -- ▼ 조회 시작
    DATE '2026-06-30' AS end_date,     -- ▼ 조회 종료
    NULL::text AS vendor_code          -- ▼ 예: Klever 코드. NULL=전체
),
hq_vendors AS (
  SELECT lower(trim(v.code)) AS vendor_code_lc
  FROM public.vendors v
  WHERE lower(trim(COALESCE(v.code, ''))) = 'hq'
     OR lower(trim(COALESCE(v.type, ''))) IN ('본사', 'head office', 'hq')
     OR lower(trim(COALESCE(v.type, ''))) LIKE '%본사%'
     OR lower(trim(COALESCE(v.type, ''))) LIKE '%head office%'
     OR lower(COALESCE(v.name, '') || ' ' || COALESCE(v.gps_name, '')) ~* '\(head office\)|\(본사\)'
),
batch_linked AS (
  SELECT
    l.inbound_batch_id,
    SUM(abs(COALESCE(l.amount, 0)))::numeric AS linked_sum
  FROM public.bank_transaction_inbound_links l
  GROUP BY l.inbound_batch_id
),
inbound_remain AS (
  SELECT
    ib.id AS batch_id,
    left(trim(ib.batch_date::text), 10) AS batch_date,
    trim(ib.vendor_code) AS vendor_code,
    trim(ib.vendor_name) AS vendor_name,
    trim(ib.location) AS location,
    abs(COALESCE(ib.total_amount, 0))::numeric AS total_amount,
    GREATEST(
      0,
      abs(COALESCE(ib.total_amount, 0))
        - COALESCE(bl.linked_sum, 0)
    )::numeric AS remain_amount
  FROM public.inbound_batches ib
  LEFT JOIN batch_linked bl ON bl.inbound_batch_id = ib.id
  WHERE abs(COALESCE(ib.total_amount, 0)) > 0.01
),
uncoupled_bank AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS pay_amount,
    trim(bt.vendor_code) AS vendor_code,
    trim(COALESCE(v.name, bt.vendor_code, '')) AS vendor_name,
    trim(COALESCE(ba.store, bt.store_name, bt.store, '')) AS store_hint,
    left(COALESCE(bt.memo, ''), 80) AS bank_memo
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  LEFT JOIN public.vendors v ON lower(trim(v.code)) = lower(trim(bt.vendor_code))
  CROSS JOIN params p
  WHERE bt.trans_type = 'withdraw'
    AND bt.category = 'purchase_payment'
    AND trim(COALESCE(bt.vendor_code, '')) <> ''
    AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
    AND (p.vendor_code IS NULL OR lower(trim(bt.vendor_code)) = lower(trim(p.vendor_code)))
    AND NOT EXISTS (
      SELECT 1 FROM public.bank_transaction_inbound_links l WHERE l.bank_transaction_id = bt.id
    )
    AND NOT EXISTS (
      SELECT 1 FROM hq_vendors hv WHERE lower(trim(bt.vendor_code)) = hv.vendor_code_lc
    )
),
matchable AS (
  SELECT
    ub.bank_id,
    ub.trans_date,
    ub.pay_amount,
    ub.vendor_code,
    ub.vendor_name,
    ub.store_hint,
    ub.bank_memo,
    ir.batch_id,
    ir.batch_date,
    ir.location AS batch_location,
    ir.remain_amount,
    CASE
      WHEN ir.remain_amount >= ub.pay_amount - 0.02 THEN '전액배치1건'
      WHEN ir.remain_amount > 0.01 THEN '부분배치(FIFO)'
      ELSE '잔액없음'
    END AS match_hint
  FROM uncoupled_bank ub
  JOIN inbound_remain ir
    ON ir.remain_amount > 0.01
   AND left(trim(ir.batch_date::text), 10)::date <= ub.trans_date::date
   AND (
     lower(trim(COALESCE(ir.vendor_code, ''))) = lower(trim(ub.vendor_code))
     OR lower(trim(COALESCE(ir.vendor_name, ''))) = lower(trim(ub.vendor_name))
   )
   AND (
     lower(trim(COALESCE(ir.location, ''))) = lower(trim(COALESCE(ub.store_hint, '')))
     OR lower(trim(COALESCE(ub.store_hint, ''))) LIKE '%' || lower(trim(ir.location)) || '%'
     OR lower(trim(COALESCE(ir.location, ''))) LIKE '%' || lower(trim(ub.store_hint)) || '%'
     OR (
       lower(trim(COALESCE(ub.store_hint, ''))) IN ('hq', '본사', 'office', '오피스', '본점')
       AND ir.location IN ('입고등록', '본사', 'Office', '오피스', '본점')
     )
   )
)
SELECT
  0 AS sort_key,
  '【미연동 매입대금 출금】' AS label,
  COUNT(DISTINCT bank_id)::text AS detail,
  ROUND(COALESCE(SUM(DISTINCT pay_amount), 0)::numeric, 2)::text AS amount_or_batch,
  NULL::bigint AS bank_id,
  NULL::bigint AS batch_id
FROM uncoupled_bank

UNION ALL

SELECT
  0,
  '【입고 배치 매칭 가능】',
  COUNT(DISTINCT bank_id)::text,
  NULL,
  NULL,
  NULL
FROM matchable

UNION ALL

SELECT
  1,
  vendor_name || ' | ' || trans_date || ' | ฿' || pay_amount::text,
  match_hint,
  remain_amount::text,
  bank_id,
  batch_id
FROM matchable
ORDER BY sort_key, label;

-- =============================================================================
-- 【P3】 검증 — 미연동 잔여 건수 (정리 후 Run)
-- =============================================================================
/*
WITH params AS (
  SELECT DATE '2026-02-01' AS start_date, DATE '2026-06-30' AS end_date
)
SELECT
  COUNT(*)::bigint AS uncoupled_purchase_payment_cnt,
  ROUND(COALESCE(SUM(abs(bt.amount)), 0)::numeric, 2) AS uncoupled_amount_sum
FROM public.bank_transactions bt
CROSS JOIN params p
WHERE bt.trans_type = 'withdraw'
  AND bt.category = 'purchase_payment'
  AND trim(COALESCE(bt.vendor_code, '')) <> ''
  AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
  AND NOT EXISTS (
    SELECT 1 FROM public.bank_transaction_inbound_links l WHERE l.bank_transaction_id = bt.id
  );
*/
