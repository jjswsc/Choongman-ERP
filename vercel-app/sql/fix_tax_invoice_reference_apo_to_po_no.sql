-- Tax Invoice/Receipt Reference에 미수 내부번호(APO…)가 저장된 건을
-- 발주 Invoice 번호(purchase_orders.po_no, 예: PO-20260807-4180)로 맞춤.
-- invoice_settings만 수정. pos_orders 없음 → 영업 중 실행 가능.
--
-- 1) Preview
-- SELECT
--   s.code,
--   s.value::jsonb->>'referenceNo' AS old_reference,
--   po.po_no AS new_reference
-- FROM invoice_settings s
-- JOIN LATERAL (
--   SELECT (regexp_match(s.code, '^invoice_print_override:tax:(?:PO|AccountingPO):(\d+)$'))[1]::bigint AS po_id
-- ) x ON x.po_id IS NOT NULL
-- JOIN purchase_orders po ON po.id = x.po_id
-- WHERE s.code ~ '^invoice_print_override:tax:(PO|AccountingPO):\d+$'
--   AND COALESCE(s.value::jsonb->>'referenceNo', '') ~* '^APO([0-9]{8}-|#)[0-9]+$'
--   AND COALESCE(btrim(po.po_no), '') <> '';

BEGIN;

UPDATE invoice_settings s
SET value = jsonb_set(
  s.value::jsonb,
  '{referenceNo}',
  to_jsonb(po.po_no),
  true
)::text
FROM purchase_orders po
WHERE s.code ~ '^invoice_print_override:tax:(PO|AccountingPO):\d+$'
  AND po.id = (regexp_match(s.code, '^invoice_print_override:tax:(?:PO|AccountingPO):(\d+)$'))[1]::bigint
  AND COALESCE(s.value::jsonb->>'referenceNo', '') ~* '^APO([0-9]{8}-|#)[0-9]+$'
  AND COALESCE(btrim(po.po_no), '') <> '';

COMMIT;
