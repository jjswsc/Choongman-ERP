-- =============================================================================
-- 본사 미수금(회계발주) 출처 확인
-- 화면: APO20260703-173 / APO20260703-174
--        메모 회계발주 PO-20260703-9245 / PO-20260703-5907
--        잔액 ฿6,207.30 + ฿6,998.25 = ฿13,205.55
-- 같은 패턴 참고: S&J APO20260714-165 (฿21,300, 수령처 S&J 본사창고 발주)
--
-- ⚠ SELECT만. UPDATE/DELETE 하지 마세요.
-- Supabase SQL Editor에 붙여넣고 ①→④ 순서로 Run
-- =============================================================================

-- ① 미수금 원장: 본사·HQ·S&J 로 잡힌 AccountingPO 행
SELECT
  rt.id AS rec_id,
  rt.trans_date,
  rt.store_name,
  rt.creditor_store,
  rt.ref_type,
  rt.ref_id AS po_id,
  rt.invoice_no,
  rt.amount,
  rt.memo,
  rt.receive_checked,
  po.po_no,
  po.status AS po_status,
  po.vendor_name,
  po.location_name,
  po.total AS po_total,
  po.withholding_tax_amount AS po_wht,
  ROUND((COALESCE(po.total, 0) - COALESCE(po.withholding_tax_amount, 0))::numeric, 2) AS po_net,
  po.user_name AS po_author,
  po.created_at AS po_created_at
FROM public.receivable_transactions rt
LEFT JOIN public.purchase_orders po
  ON po.id = rt.ref_id
WHERE rt.ref_type = 'AccountingPO'
  AND (
    rt.store_name ILIKE '%본사%'
    OR rt.store_name ILIKE '%office%'
    OR rt.store_name ILIKE '%hq%'
    OR rt.store_name ILIKE 'S&J%'
    OR rt.store_name ILIKE '%입고등록%'
    OR rt.invoice_no IN ('APO20260703-173', 'APO20260703-174', 'APO20260714-165')
    OR rt.memo ILIKE '%PO-20260703-9245%'
    OR rt.memo ILIKE '%PO-20260703-5907%'
  )
ORDER BY rt.trans_date, rt.id;

-- ② 해당 PO의 cart_json 메타 — 청구매장(relatedStore)이 비면 수령처(location_name=본사)로 미수가 붙음
SELECT
  po.id AS po_id,
  po.po_no,
  po.status,
  po.vendor_name,
  po.location_name,
  po.location_code,
  po.total,
  po.withholding_tax_amount,
  po.user_name,
  po.created_at,
  CASE
    WHEN po.cart_json IS NULL THEN NULL
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object'
      THEN po.cart_json::jsonb -> 'meta' ->> 'relatedStore'
    ELSE NULL
  END AS meta_related_store,
  CASE
    WHEN po.cart_json IS NULL THEN NULL
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object'
      THEN po.cart_json::jsonb -> 'meta' ->> 'issuerStore'
    ELSE NULL
  END AS meta_issuer_store,
  CASE
    WHEN po.cart_json IS NULL THEN NULL
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object'
      THEN po.cart_json::jsonb -> 'meta' ->> 'orderDate'
    ELSE NULL
  END AS meta_order_date,
  CASE
    WHEN po.cart_json IS NULL THEN NULL
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object'
      THEN po.cart_json::jsonb -> 'meta' ->> 'billingKind'
    ELSE NULL
  END AS meta_billing_kind,
  CASE
    WHEN po.cart_json IS NULL THEN NULL
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object'
      THEN po.cart_json::jsonb -> 'meta' ->> 'billingMonthYm'
    ELSE NULL
  END AS meta_billing_month,
  CASE
    WHEN po.cart_json IS NULL THEN NULL
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'array' THEN 'array(물류형)'
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object'
      AND po.cart_json::jsonb ? 'meta' THEN 'object+meta(회계형 판정)'
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object' THEN 'object'
    ELSE jsonb_typeof(po.cart_json::jsonb)
  END AS cart_shape
FROM public.purchase_orders po
WHERE po.id IN (173, 174, 165)
   OR po.po_no IN ('PO-20260703-9245', 'PO-20260703-5907')
   OR po.id IN (
     SELECT rt.ref_id
     FROM public.receivable_transactions rt
     WHERE rt.ref_type = 'AccountingPO'
       AND (
         rt.store_name ILIKE '%본사%'
         OR rt.store_name ILIKE '%office%'
         OR rt.store_name ILIKE '%hq%'
         OR rt.store_name ILIKE 'S&J%'
       )
   )
ORDER BY po.id;

-- ③ 같은 날(2026-07-03) 수령처=본사 회계형 PO 중, 미수가 본사로 남은 건 vs 매장으로 간 건
SELECT
  po.id AS po_id,
  po.po_no,
  po.status,
  po.vendor_name,
  po.location_name,
  po.total,
  CASE
    WHEN po.cart_json IS NULL THEN NULL
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object'
      THEN po.cart_json::jsonb -> 'meta' ->> 'relatedStore'
    ELSE NULL
  END AS meta_related_store,
  rt.id AS rec_id,
  rt.store_name AS rec_store,
  rt.amount AS rec_amount,
  rt.invoice_no
FROM public.purchase_orders po
LEFT JOIN public.receivable_transactions rt
  ON rt.ref_type = 'AccountingPO' AND rt.ref_id = po.id
WHERE po.location_name ILIKE '%본사%'
  AND po.created_at >= TIMESTAMPTZ '2026-07-03 00:00:00+07'
  AND po.created_at <  TIMESTAMPTZ '2026-07-04 00:00:00+07'
ORDER BY po.id;

-- ④ 출고·주문 쪽에는 없는지 (물류 미발행 확인)
SELECT 'orders' AS src, o.id, o.store_name, o.status, o.total
FROM public.orders o
WHERE o.id IN (173, 174)
UNION ALL
SELECT 'stock_logs ForceOutbound', sl.id, sl.vendor_target, sl.log_type, sl.qty
FROM public.stock_logs sl
WHERE sl.id IN (173, 174)
   OR (sl.log_type = 'ForceOutbound' AND sl.vendor_target ILIKE '%본사%'
       AND sl.log_date >= DATE '2026-07-03' AND sl.log_date < DATE '2026-07-15')
LIMIT 50;
