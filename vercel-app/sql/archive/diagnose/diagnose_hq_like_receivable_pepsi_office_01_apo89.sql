-- 1/5 สาขาซื้อเอง / APO20260511-89 미수 + 발주
-- SELECT만. 이것만 복사 → Run
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
  rt.bank_transaction_id,
  po.po_no,
  po.status AS po_status,
  po.vendor_code,
  po.vendor_name,
  po.location_name,
  po.total AS po_total,
  po.withholding_tax_amount AS po_wht,
  po.user_name AS po_author,
  po.created_at AS po_created_at,
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
  END AS meta_billing_kind
FROM public.receivable_transactions rt
LEFT JOIN public.purchase_orders po
  ON po.id = rt.ref_id
WHERE rt.invoice_no = 'APO20260511-89'
   OR (rt.ref_type = 'AccountingPO' AND rt.ref_id = 89)
   OR rt.store_name ILIKE '%ซื้อเอง%'
ORDER BY rt.id
