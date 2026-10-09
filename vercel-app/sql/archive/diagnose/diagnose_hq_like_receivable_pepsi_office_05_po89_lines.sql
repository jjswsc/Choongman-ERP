-- 5/5 PO 89 품목 줄
-- SELECT만. 이것만 복사 → Run
SELECT
  po.id AS po_id,
  COALESCE(line->>'name', line->>'code') AS item_name,
  line->>'qty' AS qty,
  line->>'price' AS price,
  line->>'store' AS line_store
FROM public.purchase_orders po
CROSS JOIN LATERAL jsonb_array_elements(
  CASE
    WHEN po.cart_json IS NULL THEN '[]'::jsonb
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'array' THEN po.cart_json::jsonb
    WHEN jsonb_typeof(po.cart_json::jsonb) = 'object'
      THEN COALESCE(po.cart_json::jsonb -> 'items', '[]'::jsonb)
    ELSE '[]'::jsonb
  END
) AS line
WHERE po.id = 89
