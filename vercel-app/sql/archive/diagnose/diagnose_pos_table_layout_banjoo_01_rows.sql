-- Omni 진단: banjoo·공유 매장코드(1000) 테이블 레이아웃 행 (변경 없음)
-- Admin에 테이블이 보이는데 POS에 없으면 store_code·tenant_id 불일치를 의심.

SELECT
  coalesce(nullif(btrim(p.tenant_id), ''), '(blank)') AS tenant_id,
  p.store_code,
  CASE
    WHEN p.layout_json IS NULL THEN 0
    WHEN jsonb_typeof(p.layout_json::jsonb) = 'array' THEN jsonb_array_length(p.layout_json::jsonb)
    WHEN jsonb_typeof(p.layout_json::jsonb) = 'object'
      AND (p.layout_json::jsonb) ? 'tables'
      THEN jsonb_array_length(coalesce((p.layout_json::jsonb)->'tables', '[]'::jsonb))
    ELSE NULL
  END AS table_count,
  left(coalesce(p.layout_json::text, ''), 120) AS layout_preview,
  p.updated_at AT TIME ZONE 'Asia/Bangkok' AS updated_at_bkk
FROM public.pos_table_layouts p
WHERE lower(btrim(coalesce(p.tenant_id, ''))) IN ('banjoo', 'marubkk_01')
   OR lower(btrim(p.store_code)) IN ('1000', 'banjoo sukhumvit')
   OR lower(btrim(p.store_code)) LIKE '%banjoo%'
   OR lower(btrim(p.store_code)) LIKE '%sukhumvit%'
ORDER BY p.updated_at DESC NULLS LAST
LIMIT 30;
