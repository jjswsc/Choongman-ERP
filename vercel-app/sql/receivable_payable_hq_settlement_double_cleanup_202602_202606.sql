-- =============================================================================
-- 2차 정리: 2026-02-01 ~ 2026-06-30 전 기간
-- 가맹 K-bank 출금(매입대금·본사) + HQ 입금(매출수령) 이중 — 4/8·6/10 등 동일 패턴
--
-- 1차(3/18·4/8만)는 이미 실행됨 → purchase_payment→transfer 된 건은 자동 제외
-- HQ receivable_receive · receivable_transactions 는 변경하지 않음
--
-- 순서: 【P1 미리보기】→ 【P2 정리】→ 【P3 검증】
-- =============================================================================

-- =============================================================================
-- 【P1】 미리보기 — 건수·목록 확인 (Run)
-- =============================================================================
WITH params AS (
  SELECT
    DATE '2026-02-01' AS start_date,
    DATE '2026-06-30' AS end_date
),
hq_vendors AS (
  SELECT lower(trim(v.code)) AS vendor_code_lc, trim(v.code) AS vendor_code, trim(v.name) AS vendor_name
  FROM public.vendors v
  WHERE lower(trim(COALESCE(v.code, ''))) = 'hq'
     OR lower(trim(COALESCE(v.type, ''))) IN ('본사', 'head office', 'hq')
     OR lower(trim(COALESCE(v.type, ''))) LIKE '%본사%'
     OR lower(trim(COALESCE(v.type, ''))) LIKE '%head office%'
     OR lower(COALESCE(v.name, '') || ' ' || COALESCE(v.gps_name, '')) ~* '\(head office\)|\(본사\)'
),
store_withdraw AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
    trim(bt.vendor_code) AS vendor_code,
    ba.store AS account_store,
    ba.name AS account_no,
    left(COALESCE(bt.memo, ''), 120) AS bank_memo,
    pt.id AS payable_id
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  JOIN hq_vendors hv ON lower(trim(bt.vendor_code)) = hv.vendor_code_lc
  LEFT JOIN public.payable_transactions pt
    ON pt.bank_transaction_id = bt.id AND pt.ref_type = 'Payment'
  CROSS JOIN params p
  WHERE bt.trans_type = 'withdraw'
    AND bt.category = 'purchase_payment'
    AND lower(trim(COALESCE(ba.store, ''))) NOT IN ('hq', '본사', 'office', 'cm office', '오피스')
    AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
    AND NOT EXISTS (
      SELECT 1 FROM public.bank_transaction_inbound_links l
      WHERE l.bank_transaction_id = bt.id
    )
),
hq_deposit AS (
  SELECT
    bt.id AS deposit_bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
    trim(COALESCE(bt.store_name, bt.store, '')) AS receivable_store
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit'
    AND bt.category = 'receivable_receive'
    AND lower(trim(COALESCE(ba.store, ''))) IN ('hq', '본사', 'office', 'cm office', '오피스')
    AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
),
fix_candidates AS (
  SELECT
    sw.*,
    hd.deposit_bank_id,
    hd.receivable_store,
    CASE
      WHEN hd.deposit_bank_id IS NOT NULL THEN 'HQ매출수령 동일금액쌍'
      ELSE '이체적요(본사송금)'
    END AS fix_reason
  FROM store_withdraw sw
  LEFT JOIN hq_deposit hd
    ON hd.trans_date = sw.trans_date AND hd.amount_abs = sw.amount_abs
  WHERE hd.deposit_bank_id IS NOT NULL
     OR COALESCE(sw.bank_memo, '') ~* '이체|transfer|x0790|x8790|s&j\s*global'
),
orphan_hq_payables AS (
  SELECT pt.id AS payable_id, left(trim(pt.trans_date::text), 10) AS trans_date,
         abs(COALESCE(pt.amount, 0))::numeric AS amount_abs
  FROM public.payable_transactions pt
  JOIN hq_vendors hv ON lower(trim(pt.vendor_code)) = hv.vendor_code_lc
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND pt.memo ILIKE '통장 지급%'
    AND pt.bank_transaction_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.bank_transactions b WHERE b.id = pt.bank_transaction_id)
    AND left(trim(pt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
),
preview_rows AS (
  SELECT 0 AS sort_key, '【정리 대상 출금】' AS label, COUNT(*)::text AS detail,
         NULL::bigint AS bank_id, NULL::bigint AS payable_id, NULL::text AS fix_reason
  FROM fix_candidates
  UNION ALL
  SELECT 0, '【고아 미지급(본사·통장지급)】', COUNT(*)::text, NULL, NULL, NULL
  FROM orphan_hq_payables
  UNION ALL
  SELECT 1, account_store || ' | ' || trans_date || ' | ฿' || amount_abs::text,
         fix_reason, bank_id, payable_id, left(bank_memo, 80)
  FROM fix_candidates
)
SELECT sort_key, label, detail, bank_id, payable_id, fix_reason
FROM preview_rows
ORDER BY sort_key, label DESC NULLS LAST;

-- =============================================================================
-- 【P2】 정리 실행 — P1 확인 후 붙여넣기
-- =============================================================================
/*
BEGIN;

WITH params AS (
  SELECT DATE '2026-02-01' AS start_date, DATE '2026-06-30' AS end_date
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
store_withdraw AS (
  SELECT bt.id AS bank_id, left(trim(bt.trans_date::text), 10) AS trans_date,
         abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
         left(COALESCE(bt.memo, ''), 160) AS bank_memo
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  JOIN hq_vendors hv ON lower(trim(bt.vendor_code)) = hv.vendor_code_lc
  CROSS JOIN params p
  WHERE bt.trans_type = 'withdraw' AND bt.category = 'purchase_payment'
    AND lower(trim(COALESCE(ba.store, ''))) NOT IN ('hq', '본사', 'office', 'cm office', '오피스')
    AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
    AND NOT EXISTS (SELECT 1 FROM public.bank_transaction_inbound_links l WHERE l.bank_transaction_id = bt.id)
),
hq_deposit AS (
  SELECT left(trim(bt.trans_date::text), 10) AS trans_date,
         abs(COALESCE(bt.amount, 0))::numeric AS amount_abs
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit' AND bt.category = 'receivable_receive'
    AND lower(trim(COALESCE(ba.store, ''))) IN ('hq', '본사', 'office', 'cm office', '오피스')
    AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
),
fix_bank_ids AS (
  SELECT sw.bank_id
  FROM store_withdraw sw
  LEFT JOIN hq_deposit hd ON hd.trans_date = sw.trans_date AND hd.amount_abs = sw.amount_abs
  WHERE hd.trans_date IS NOT NULL
     OR COALESCE(sw.bank_memo, '') ~* '이체|transfer|x0790|x8790|s&j\s*global'
),
del_payable AS (
  DELETE FROM public.payable_transactions pt
  WHERE pt.ref_type = 'Payment'
    AND pt.bank_transaction_id IN (SELECT bank_id FROM fix_bank_ids)
  RETURNING pt.id, pt.bank_transaction_id
),
upd_bank AS (
  UPDATE public.bank_transactions bt
  SET category = 'transfer', vendor_code = NULL
  WHERE bt.id IN (SELECT bank_id FROM fix_bank_ids)
  RETURNING bt.id
),
del_orphan AS (
  DELETE FROM public.payable_transactions pt
  USING hq_vendors hv
  WHERE pt.ref_type = 'Payment'
    AND pt.memo ILIKE '통장 지급%'
    AND lower(trim(pt.vendor_code)) = hv.vendor_code_lc
    AND pt.bank_transaction_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.bank_transactions b WHERE b.id = pt.bank_transaction_id)
    AND left(trim(pt.trans_date::text), 10)::date BETWEEN (SELECT start_date FROM params) AND (SELECT end_date FROM params)
  RETURNING pt.id
)
SELECT
  (SELECT COUNT(*) FROM fix_bank_ids) AS banks_to_transfer,
  (SELECT COUNT(*) FROM del_payable) AS payables_deleted,
  (SELECT COUNT(*) FROM upd_bank) AS banks_updated,
  (SELECT COUNT(*) FROM del_orphan) AS orphans_deleted;

COMMIT;
*/

-- =============================================================================
-- 【P3】 검증 — P2 직후 (Run)
-- =============================================================================
WITH params AS (
  SELECT DATE '2026-02-01' AS start_date, DATE '2026-06-30' AS end_date
),
hq_vendors AS (
  SELECT lower(trim(v.code)) AS vendor_code_lc
  FROM public.vendors v
  WHERE lower(trim(COALESCE(v.code, ''))) = 'hq'
     OR lower(COALESCE(v.name, '') || ' ' || COALESCE(v.gps_name, '')) ~* 'head office|본사'
)
SELECT '잔여 매장→본사 purchase_payment(입고연동없음)' AS check_name, COUNT(*)::bigint AS cnt
FROM public.bank_transactions bt
JOIN public.bank_accounts ba ON ba.id = bt.account_id
JOIN hq_vendors hv ON lower(trim(bt.vendor_code)) = hv.vendor_code_lc
CROSS JOIN params p
WHERE bt.trans_type = 'withdraw' AND bt.category = 'purchase_payment'
  AND lower(trim(COALESCE(ba.store, ''))) NOT IN ('hq', '본사', 'office', 'cm office', '오피스')
  AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
  AND NOT EXISTS (SELECT 1 FROM public.bank_transaction_inbound_links l WHERE l.bank_transaction_id = bt.id)

UNION ALL

SELECT '이중의심 잔여(HQ쌍 또는 이체적요)', COUNT(*)::bigint
FROM public.bank_transactions bt
JOIN public.bank_accounts ba ON ba.id = bt.account_id
JOIN hq_vendors hv ON lower(trim(bt.vendor_code)) = hv.vendor_code_lc
CROSS JOIN params p
WHERE bt.trans_type = 'withdraw' AND bt.category = 'purchase_payment'
  AND lower(trim(COALESCE(ba.store, ''))) NOT IN ('hq', '본사', 'office', 'cm office', '오피스')
  AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
  AND NOT EXISTS (SELECT 1 FROM public.bank_transaction_inbound_links l WHERE l.bank_transaction_id = bt.id)
  AND (
    COALESCE(bt.memo, '') ~* '이체|transfer|x0790|x8790|s&j\s*global'
    OR EXISTS (
      SELECT 1 FROM public.bank_transactions hd
      JOIN public.bank_accounts hba ON hba.id = hd.account_id
      WHERE hd.trans_type = 'deposit' AND hd.category = 'receivable_receive'
        AND lower(trim(COALESCE(hba.store, ''))) IN ('hq', '본사', 'office', 'cm office', '오피스')
        AND left(trim(hd.trans_date::text), 10) = left(trim(bt.trans_date::text), 10)
        AND abs(COALESCE(hd.amount, 0)) = abs(COALESCE(bt.amount, 0))
    )
  )

UNION ALL

SELECT 'HQ receivable_receive 입금 (유지)', COUNT(*)::bigint
FROM public.bank_transactions bt
JOIN public.bank_accounts ba ON ba.id = bt.account_id
CROSS JOIN params p
WHERE bt.trans_type = 'deposit' AND bt.category = 'receivable_receive'
  AND lower(trim(COALESCE(ba.store, ''))) IN ('hq', '본사', 'office', 'cm office', '오피스')
  AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date

UNION ALL

SELECT 'receivable Receive 통장연동 (유지)', COUNT(*)::bigint
FROM public.receivable_transactions rt
CROSS JOIN params p
WHERE rt.ref_type = 'Receive' AND rt.bank_transaction_id IS NOT NULL
  AND left(trim(rt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date;
