-- =============================================================================
-- 가맹 K-bank → 본사(HQ) 정산 송금이 「매입 대금」으로 잘못 들어간 미지급 이중 정리
--
-- 대상 패턴 (자동 탐지):
--   · 매장 통장(bank_accounts.store <> HQ) 출금 + category=purchase_payment + 본사 거래처
--   · HQ 통장 입금(receivable_receive)과 같은 날·같은 금액 쌍  OR  이체 적요(X0790/X8790 등)
--   · 입고 연동(bank_transaction_inbound_links) 없음 — 진짜 매입 지급은 제외
--
-- 하지 않는 것 (미수금 유지):
--   · HQ 통장 입금 · receivable_receive · receivable_transactions 는 건드리지 않음
--
-- 실행 순서: (0) 계좌 확인 → (1) 미리보기 → (2) 정리 → (3) 검증
-- ⚠ (2)는 BEGIN…COMMIT 블록. Supabase에서 미리보기 확인 후 주석 해제 실행.
-- =============================================================================

-- ── (0) 계좌 id 참고 ───────────────────────────────────────────────────────
-- SELECT id, name, bank_name, store FROM public.bank_accounts ORDER BY id;

-- ── params ───────────────────────────────────────────────────────────────────
-- 기간·특정일을 좁히려면 focus_dates 에 넣거나 NULL 로 두면 기간 전체 스캔
/*
WITH params AS (
  SELECT
    DATE '2026-03-01' AS start_date,
    DATE '2026-04-30' AS end_date,
    ARRAY['2026-03-18', '2026-04-08']::text[] AS focus_dates  -- NULL 이면 기간 전체
),
*/

-- =============================================================================
-- (1) 미리보기 — 정리 대상 출금·미지급·HQ 입금 쌍
-- =============================================================================
WITH params AS (
  SELECT
    DATE '2026-03-01' AS start_date,
    DATE '2026-04-30' AS end_date,
    ARRAY['2026-03-18', '2026-04-08']::text[] AS focus_dates
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
    bt.category,
    ba.id AS account_id,
    ba.name AS account_no,
    trim(ba.store) AS account_store,
    left(COALESCE(bt.memo, ''), 160) AS bank_memo,
    pt.id AS payable_id,
    left(COALESCE(pt.memo, ''), 120) AS payable_memo
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  JOIN hq_vendors hv ON lower(trim(bt.vendor_code)) = hv.vendor_code_lc
  LEFT JOIN public.payable_transactions pt
    ON pt.bank_transaction_id = bt.id AND pt.ref_type = 'Payment'
  CROSS JOIN params p
  WHERE bt.trans_type = 'withdraw'
    AND bt.category = 'purchase_payment'
    AND lower(trim(COALESCE(ba.store, ''))) NOT IN ('hq', '본사', 'office', 'cm office', '오피스')
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
    AND (
      p.focus_dates IS NULL
      OR left(trim(bt.trans_date::text), 10) = ANY (p.focus_dates)
    )
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
    trim(COALESCE(bt.store_name, bt.store, '')) AS receivable_store,
    left(COALESCE(bt.memo, ''), 120) AS deposit_memo
  FROM public.bank_transactions bt
  JOIN public.bank_accounts ba ON ba.id = bt.account_id
  CROSS JOIN params p
  WHERE bt.trans_type = 'deposit'
    AND bt.category = 'receivable_receive'
    AND lower(trim(COALESCE(ba.store, ''))) IN ('hq', '본사', 'office', 'cm office', '오피스')
    AND left(trim(bt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(bt.trans_date::text), 10)::date <= p.end_date
),
fix_candidates AS (
  SELECT
    sw.*,
    hd.deposit_bank_id,
    hd.receivable_store,
    hd.deposit_memo,
    (hd.deposit_bank_id IS NOT NULL) AS has_hq_receive_pair,
    (COALESCE(sw.bank_memo, '') ~* '이체|transfer|x0790|x8790|s&j\s*global') AS memo_like_hq_transfer,
    CASE
      WHEN hd.deposit_bank_id IS NOT NULL THEN 'HQ매출수령과 동일금액쌍'
      WHEN COALESCE(sw.bank_memo, '') ~* '이체|transfer|x0790|x8790|s&j\s*global' THEN '이체적요(본사송금)'
      ELSE '수동확인'
    END AS fix_reason
  FROM store_withdraw sw
  LEFT JOIN hq_deposit hd
    ON hd.trans_date = sw.trans_date AND hd.amount_abs = sw.amount_abs
  WHERE hd.deposit_bank_id IS NOT NULL
     OR COALESCE(sw.bank_memo, '') ~* '이체|transfer|x0790|x8790|s&j\s*global'
),
orphan_payables AS (
  SELECT
    pt.id AS payable_id,
    pt.bank_transaction_id AS missing_bank_id,
    left(trim(pt.trans_date::text), 10) AS trans_date,
    abs(COALESCE(pt.amount, 0))::numeric AS amount_abs,
    left(COALESCE(pt.memo, ''), 120) AS payable_memo
  FROM public.payable_transactions pt
  JOIN hq_vendors hv ON lower(trim(pt.vendor_code)) = hv.vendor_code_lc
  CROSS JOIN params p
  WHERE pt.ref_type = 'Payment'
    AND pt.bank_transaction_id IS NOT NULL
    AND pt.memo ILIKE '통장 지급%'
    AND left(trim(pt.trans_date::text), 10)::date >= p.start_date
    AND left(trim(pt.trans_date::text), 10)::date <= p.end_date
    AND (
      p.focus_dates IS NULL
      OR left(trim(pt.trans_date::text), 10) = ANY (p.focus_dates)
    )
    AND NOT EXISTS (SELECT 1 FROM public.bank_transactions bt WHERE bt.id = pt.bank_transaction_id)
)
SELECT 0 AS sort_key, '【정리 대상 출금】' AS section, COUNT(*)::text AS detail, NULL::bigint AS bank_id, NULL::bigint AS payable_id
FROM fix_candidates
UNION ALL
SELECT 0, '【고아 미지급 삭제】', COUNT(*)::text, NULL, NULL FROM orphan_payables
UNION ALL
SELECT 1, account_store || ' | ' || trans_date || ' | ฿' || amount_abs::text, fix_reason, bank_id, payable_id
FROM fix_candidates
UNION ALL
SELECT 2, 'ORPHAN payable ' || payable_id::text || ' missing bank ' || missing_bank_id::text,
  trans_date || ' | ฿' || amount_abs::text, NULL, payable_id
FROM orphan_payables
ORDER BY sort_key, bank_id NULLS LAST, payable_id NULLS LAST;

-- HQ 쌍·사유 상세 (위 결과 다음에 실행)
/*
WITH ... (fix_candidates 동일 CTE — 생략 시 (1) 블록 복사 후)
SELECT bank_id, payable_id, trans_date, amount_abs, account_store, account_no,
       fix_reason, has_hq_receive_pair, deposit_bank_id, receivable_store,
       bank_memo, payable_memo
FROM fix_candidates
ORDER BY trans_date, amount_abs DESC;
*/

-- 고아 미지급
/*
-- orphan_payables CTE 후:
SELECT * FROM orphan_payables ORDER BY trans_date, payable_id;
*/

-- =============================================================================
-- (2) 정리 — 통장 purchase_payment → transfer, 미지급 Payment 삭제, 고아 삭제
-- 미리보기 bank_id·payable_id 확인 후 주석 해제
-- =============================================================================
/*
BEGIN;

WITH params AS (
  SELECT
    DATE '2026-03-01' AS start_date,
    DATE '2026-04-30' AS end_date,
    ARRAY['2026-03-18', '2026-04-08']::text[] AS focus_dates
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
    AND (p.focus_dates IS NULL OR left(trim(bt.trans_date::text), 10) = ANY (p.focus_dates))
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
  SET
    category = 'transfer',
    vendor_code = NULL
  WHERE bt.id IN (SELECT bank_id FROM fix_bank_ids)
  RETURNING bt.id
),
del_orphan AS (
  DELETE FROM public.payable_transactions pt
  WHERE pt.ref_type = 'Payment'
    AND pt.memo ILIKE '통장 지급%'
    AND pt.bank_transaction_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.bank_transactions b WHERE b.id = pt.bank_transaction_id)
    AND left(trim(pt.trans_date::text), 10)::date BETWEEN (SELECT start_date FROM params) AND (SELECT end_date FROM params)
    AND (
      (SELECT focus_dates FROM params LIMIT 1) IS NULL
      OR left(trim(pt.trans_date::text), 10) IN (SELECT unnest(focus_dates) FROM params)
    )
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
-- (3) 검증 — 미지급 본사 지급 잔여·미수금 유지
-- =============================================================================
/*
WITH params AS (
  SELECT DATE '2026-03-01' AS start_date, DATE '2026-04-30' AS end_date
),
hq_vendors AS (
  SELECT lower(trim(v.code)) AS vendor_code_lc FROM public.vendors v
  WHERE lower(trim(COALESCE(v.code, ''))) = 'hq'
     OR lower(COALESCE(v.name, '') || ' ' || COALESCE(v.gps_name, '')) ~* 'head office|본사'
)
-- 남은 문제 출금 (0건이어야 함)
SELECT '남은 매장→본사 purchase_payment' AS check_name, COUNT(*)::bigint AS cnt
FROM public.bank_transactions bt
JOIN public.bank_accounts ba ON ba.id = bt.account_id
JOIN hq_vendors hv ON lower(trim(bt.vendor_code)) = hv.vendor_code_lc
CROSS JOIN params p
WHERE bt.trans_type = 'withdraw' AND bt.category = 'purchase_payment'
  AND lower(trim(COALESCE(ba.store, ''))) NOT IN ('hq', '본사', 'office', 'cm office')
  AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date
  AND NOT EXISTS (SELECT 1 FROM public.bank_transaction_inbound_links l WHERE l.bank_transaction_id = bt.id)

UNION ALL

-- HQ 매출수령·미수금 (유지 확인)
SELECT 'HQ receivable_receive 입금', COUNT(*)::bigint
FROM public.bank_transactions bt
JOIN public.bank_accounts ba ON ba.id = bt.account_id
CROSS JOIN params p
WHERE bt.trans_type = 'deposit' AND bt.category = 'receivable_receive'
  AND lower(trim(COALESCE(ba.store, ''))) IN ('hq', '본사', 'office', 'cm office')
  AND left(trim(bt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date

UNION ALL

SELECT 'receivable Receive (통장연동)', COUNT(*)::bigint
FROM public.receivable_transactions rt
CROSS JOIN params p
WHERE rt.ref_type = 'Receive' AND rt.bank_transaction_id IS NOT NULL
  AND left(trim(rt.trans_date::text), 10)::date BETWEEN p.start_date AND p.end_date;
*/

-- =============================================================================
-- 참고: 통장 UI에서 동일 효과 — 매장 출금 용도 「이체」+ 거래처 제거
-- HQ 입금 「매출 수령」·미수 연결은 변경하지 않음
-- =============================================================================
