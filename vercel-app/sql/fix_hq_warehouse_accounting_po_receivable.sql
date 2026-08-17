-- =============================================================================
-- 본사·S&J 창고에 잘못 붙은 회계발주 미수 3건 제거
--
-- rec 2217 APO20260703-173  PO-20260703-9245  K Market → 본사  ฿6,207.30
-- rec 2218 APO20260703-174  PO-20260703-5907  K Market → 본사  ฿6,998.25
-- rec 1644 APO20260714-165  PO-20260714-8190  Suntory  → S&J   ฿21,300.00
--
-- 원인: 청구매장(relatedStore) 없이 수령처(본사/S&J)로 미수가 생성됨.
-- 같은 날 K Market→CM Bangna 등 청구매장이 있는 행은 건드리지 않음.
--
-- ① 미리보기 → ② 통장 연결 없는지 확인 → ③ DELETE
-- 영업 중 POS 자동인쇄와 무관 (pos_orders UPDATE 없음).
-- =============================================================================

-- ① 대상 미수 행
SELECT
  rt.id,
  rt.store_name,
  rt.invoice_no,
  rt.amount,
  rt.memo,
  rt.receive_checked,
  rt.bank_transaction_id,
  po.po_no,
  po.vendor_name,
  po.location_name,
  po.status
FROM public.receivable_transactions rt
JOIN public.purchase_orders po ON po.id = rt.ref_id
WHERE rt.id IN (2217, 2218, 1644)
  AND rt.ref_type = 'AccountingPO';

-- ② 통장 수금(Receive) 자식이 있으면 삭제 금지 — 0행이어야 함
SELECT rt.id, rt.ref_type, rt.amount, rt.memo, rt.bank_transaction_id
FROM public.receivable_transactions rt
WHERE rt.ref_type = 'Receive'
  AND (
    rt.memo ILIKE '%APO20260703-173%'
    OR rt.memo ILIKE '%APO20260703-174%'
    OR rt.memo ILIKE '%APO20260714-165%'
    OR rt.memo ILIKE '%PO-20260703-9245%'
    OR rt.memo ILIKE '%PO-20260703-5907%'
    OR rt.memo ILIKE '%PO-20260714-8190%'
  );

-- ③ ②가 0행이고, ①의 bank_transaction_id·receive_checked 가 비어 있으면 실행
DELETE FROM public.receivable_transactions
WHERE id IN (2217, 2218, 1644)
  AND ref_type = 'AccountingPO'
  AND COALESCE(receive_checked, false) = false
  AND bank_transaction_id IS NULL;

-- ④ 확인 — 0행이어야 함
SELECT id, store_name, invoice_no, amount
FROM public.receivable_transactions
WHERE id IN (2217, 2218, 1644);
