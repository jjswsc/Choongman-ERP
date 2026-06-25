-- =============================================================================
-- Future Park / Silom 미수금 정리 (2026-06)
-- 실행: node vercel-app/scripts/repair-futurepark-silom-receivable.mjs --execute
-- (Supabase SQL 직접 실행 대신 위 스크립트 권장 — 미수 연결 로직 포함)
-- =============================================================================

-- ① 정리 후 점검 — Future Park 수동 수금확인 0건
SELECT id, store_name, trans_date, amount, memo, ref_id, bank_transaction_id
FROM public.receivable_transactions
WHERE ref_type = 'Receive'
  AND store_name ILIKE '%Future Park%'
  AND memo ILIKE '수금확인%'
  AND trans_date >= '2026-06-01'
  AND trans_date <= '2026-06-30';

-- ② Silom bank #7611 인보이스별 연결 확인
SELECT id, ref_id, amount, memo, bank_transaction_id
FROM public.receivable_transactions
WHERE ref_type = 'Receive'
  AND bank_transaction_id = 7611
ORDER BY id;

-- ③ Future Park bank #7680 → accrual #730
SELECT id, ref_id, amount, memo, bank_transaction_id
FROM public.receivable_transactions
WHERE ref_type = 'Receive'
  AND bank_transaction_id = 7680;

-- ④ 미할당 통장 입금 잔여 (0건이어야 함)
SELECT id, store_name, trans_date, amount, memo, bank_transaction_id, ref_id
FROM public.receivable_transactions
WHERE ref_type = 'Receive'
  AND ref_id IS NULL
  AND bank_transaction_id IN (7554, 7682)
ORDER BY bank_transaction_id;

-- ⑤ bank #7554 인보이스별 연결 (8건)
SELECT id, ref_id, amount, memo, bank_transaction_id
FROM public.receivable_transactions
WHERE ref_type = 'Receive'
  AND bank_transaction_id = 7554
ORDER BY id;

-- ⑥ bank #7682 부분 수금 → accrual #751 (잔액 ฿4.87)
SELECT id, ref_id, amount, memo, bank_transaction_id
FROM public.receivable_transactions
WHERE ref_type = 'Receive'
  AND bank_transaction_id = 7682;
