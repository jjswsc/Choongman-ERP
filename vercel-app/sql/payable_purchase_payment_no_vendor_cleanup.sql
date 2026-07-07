-- =============================================================================
-- 【6】매입처 없음 purchase_payment — 오분류 점검·정리
--
-- 통장 import 시 category=purchase_payment 로 잘못 들어간 건 중 vendor_code 가 비어 있음.
-- 대부분은 급여·개인이체·쇼핑/식비 등 → 매입대금이 아님. 미지급 백필 대상 아님.
--
-- 실행 순서:
--   (A) 분류 미리보기 → (B) 이체로 일괄 수정(선택) → (C) 남은 건 수동 확인
-- Supabase SQL Editor에서 (A)만 먼저 실행해 보고, (B)는 내용 확인 후 주석 해제
-- =============================================================================

-- ── (A) 메모 패턴별 분류 미리보기 ───────────────────────────────────────────
WITH misc AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    round(abs(coalesce(bt.amount, 0))::numeric, 2) AS amount,
    trim(coalesce(bt.memo, '')) AS memo,
    trim(coalesce(bt.store, '')) AS store,
    CASE
      WHEN coalesce(bt.memo, '') ILIKE 'Transfer Withdrawal%'
        OR coalesce(bt.memo, '') ILIKE '%โอนเงิน%'
        OR coalesce(bt.memo, '') ILIKE '%โอนไป%'
        THEN '이체(개인/계좌이체) — transfer 권장'
      WHEN coalesce(bt.memo, '') ILIKE '%SHOPEE%'
        OR coalesce(bt.memo, '') ILIKE '%K SHOP%'
        OR coalesce(bt.memo, '') ILIKE 'Debit Merchant%'
        OR coalesce(bt.memo, '') ILIKE 'Payment | Paid for%'
        THEN '소액결제/식비·쇼핑 — expense 권장'
      WHEN coalesce(bt.memo, '') ILIKE '%COMPANY LIMITED%'
        OR coalesce(bt.memo, '') ILIKE '%CO.,LTD%'
        OR coalesce(bt.memo, '') ILIKE '%PRODUCTION%'
        OR coalesce(bt.memo, '') ILIKE '%PRODUCTIO%'
        THEN '거래처명 의심 — 매입처 코드 확인 후 purchase_payment 유지'
      ELSE '기타 — 지출검색/통장에서 용도 수동 확인'
    END AS suggested_action
  FROM public.bank_transactions bt
  WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
    AND lower(coalesce(bt.category, '')) = 'purchase_payment'
    AND trim(coalesce(bt.vendor_code, '')) = ''
    AND abs(coalesce(bt.amount, 0)) > 0.009
)
SELECT suggested_action, COUNT(*)::bigint AS cnt, ROUND(SUM(amount)::numeric, 2) AS amount_sum
FROM misc
GROUP BY suggested_action
ORDER BY cnt DESC;

-- 상세 목록
WITH misc AS (
  SELECT
    bt.id AS bank_id,
    left(trim(bt.trans_date::text), 10) AS trans_date,
    round(abs(coalesce(bt.amount, 0))::numeric, 2) AS amount,
    trim(coalesce(bt.memo, '')) AS memo,
    CASE
      WHEN coalesce(bt.memo, '') ILIKE 'Transfer Withdrawal%'
        OR coalesce(bt.memo, '') ILIKE '%โอนเงิน%'
        OR coalesce(bt.memo, '') ILIKE '%โอนไป%'
        THEN 'transfer'
      WHEN coalesce(bt.memo, '') ILIKE '%SHOPEE%'
        OR coalesce(bt.memo, '') ILIKE '%K SHOP%'
        OR coalesce(bt.memo, '') ILIKE 'Debit Merchant%'
        OR coalesce(bt.memo, '') ILIKE 'Payment | Paid for%'
        THEN 'expense'
      ELSE 'manual'
    END AS auto_category
  FROM public.bank_transactions bt
  WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
    AND lower(coalesce(bt.category, '')) = 'purchase_payment'
    AND trim(coalesce(bt.vendor_code, '')) = ''
    AND abs(coalesce(bt.amount, 0)) > 0.009
)
SELECT bank_id, trans_date, amount, auto_category, memo
FROM misc
ORDER BY
  CASE auto_category WHEN 'manual' THEN 0 WHEN 'expense' THEN 1 ELSE 2 END,
  trans_date DESC,
  bank_id DESC;

-- ── (B) 이체로 일괄 수정 (개인명 이체·태국어 계좌이체) ─────────────────────
-- ⚠ 미리보기에서 auto_category=transfer 건수가 맞는지 확인 후 아래 주석 해제
/*
BEGIN;

WITH updated AS (
  UPDATE public.bank_transactions bt
  SET category = 'transfer'
  WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
    AND lower(coalesce(bt.category, '')) = 'purchase_payment'
    AND trim(coalesce(bt.vendor_code, '')) = ''
    AND (
      coalesce(bt.memo, '') ILIKE 'Transfer Withdrawal%'
      OR coalesce(bt.memo, '') ILIKE '%โอนเงิน%'
      OR coalesce(bt.memo, '') ILIKE '%โอนไป%'
    )
  RETURNING bt.id
)
SELECT '이체(transfer)로 수정' AS step, COUNT(*)::bigint AS cnt FROM updated;

COMMIT;
*/

-- ── (C) 소액결제/식비 → expense 일괄 수정 (계정과목은 지출검색에서 보완) ─
/*
BEGIN;

WITH updated AS (
  UPDATE public.bank_transactions bt
  SET category = 'expense'
  WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
    AND lower(coalesce(bt.category, '')) = 'purchase_payment'
    AND trim(coalesce(bt.vendor_code, '')) = ''
    AND (
      coalesce(bt.memo, '') ILIKE '%SHOPEE%'
      OR coalesce(bt.memo, '') ILIKE '%K SHOP%'
      OR coalesce(bt.memo, '') ILIKE 'Debit Merchant%'
      OR coalesce(bt.memo, '') ILIKE 'Payment | Paid for%'
    )
  RETURNING bt.id
)
SELECT '경비(expense)로 수정' AS step, COUNT(*)::bigint AS cnt FROM updated;

COMMIT;
*/

-- ── (D) 거래처명 있는 건 — vendors 후보 (수동 매칭용) ─────────────────────
-- POLAR BEAR, THAI ICE 등: 아래에서 code 확인 후 지출검색에서 매입대금+매입처 저장
SELECT
  bt.id AS bank_id,
  left(trim(bt.trans_date::text), 10) AS trans_date,
  round(abs(coalesce(bt.amount, 0))::numeric, 2) AS amount,
  bt.memo,
  v.code AS vendor_code,
  v.name AS vendor_name
FROM public.bank_transactions bt
LEFT JOIN public.vendors v ON (
  v.name ILIKE '%' || regexp_replace(
    substring(coalesce(bt.memo, '') from '([A-Z][A-Z0-9 .,&''-]{4,}(?:CO\.|COMPANY|LIMITED|LTD))'),
    '\s+', '%', 'g'
  ) || '%'
  OR v.name ILIKE '%THAI ICE%'
  OR v.name ILIKE '%POLAR BEAR%'
)
WHERE lower(coalesce(bt.trans_type, '')) = 'withdraw'
  AND lower(coalesce(bt.category, '')) = 'purchase_payment'
  AND trim(coalesce(bt.vendor_code, '')) = ''
  AND abs(coalesce(bt.amount, 0)) > 0.009
  AND (
    coalesce(bt.memo, '') ~* 'COMPANY|CO\.|LTD|LIMITED|PRODUCTION|PRODUCTIO'
  )
ORDER BY bt.trans_date DESC;
