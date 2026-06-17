-- =============================================================================
-- B2B 수금 미연동 백필 — receivable_b2b_bank_link_gaps.sql 결과 3건 (2026-06 확인)
-- bank_id: 5082, 5083 (CM Bangna 2026-05-13), 6907 (CM Huamak 2026-06-06)
--
-- ★ 앱 배포(receivable gate 수정) 후 실행 권장. 통장 분개(1010/1130)는 그대로 두고
--   receivable_transactions Receive 행만 추가합니다.
-- ★ 실행 전 아래 SELECT로 건수·금액 확인 → 3건·합계 213,160.12 맞으면 INSERT Run
-- =============================================================================

-- (1) 미리보기
SELECT
  bt.id AS bank_id,
  left(trim(bt.trans_date::text), 10) AS trans_date,
  trim(COALESCE(bt.store_name, bt.store, '')) AS store_name,
  abs(COALESCE(bt.amount, 0))::numeric AS amount_abs,
  left(COALESCE(bt.memo, ''), 120) AS memo,
  EXISTS (
    SELECT 1 FROM public.receivable_transactions rt
    WHERE rt.bank_transaction_id = bt.id AND rt.ref_type = 'Receive'
  ) AS already_linked
FROM public.bank_transactions bt
WHERE bt.id IN (5082, 5083, 6907)
  AND bt.trans_type = 'deposit'
  AND bt.category = 'receivable_receive'
ORDER BY bt.id;

-- (2) INSERT — already_linked 가 전부 false 일 때만 주석 해제 후 Run
/*
INSERT INTO public.receivable_transactions (
  store_name,
  amount,
  ref_type,
  ref_id,
  trans_date,
  memo,
  bank_transaction_id
)
SELECT
  trim(COALESCE(bt.store_name, bt.store, '')),
  -abs(COALESCE(bt.amount, 0)),
  'Receive',
  NULL,
  left(trim(bt.trans_date::text), 10),
  left('통장 수령: ' || COALESCE(bt.memo, ''), 240),
  bt.id
FROM public.bank_transactions bt
WHERE bt.id IN (5082, 5083, 6907)
  AND bt.trans_type = 'deposit'
  AND bt.category = 'receivable_receive'
  AND trim(COALESCE(bt.store_name, bt.store, '')) <> ''
  AND NOT EXISTS (
    SELECT 1 FROM public.receivable_transactions rt
    WHERE rt.bank_transaction_id = bt.id AND rt.ref_type = 'Receive'
  );
*/

-- (3) 실행 후 검증 — gap_count 0 이어야 함 (해당 bank_id 기준)
/*
SELECT rt.id, rt.bank_transaction_id, rt.store_name, rt.amount, rt.trans_date, left(rt.memo, 80) AS memo
FROM public.receivable_transactions rt
WHERE rt.bank_transaction_id IN (5082, 5083, 6907)
ORDER BY rt.bank_transaction_id;
*/
