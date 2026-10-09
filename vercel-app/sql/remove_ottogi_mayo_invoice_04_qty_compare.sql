-- 4/6 엑셀 수량 vs 주문 cart vs 출고 수량
-- 인보이스에 마요네즈가 실제로 들어 있는지, 수량이 엑셀과 같은지 확인.
-- SELECT만. 이것만 복사 → Run.

WITH req AS (
  SELECT
    excel_store,
    btrim(invoice_no) AS invoice_no,
    excel_qty,
    split_part(btrim(invoice_no), '-', 2)::bigint AS order_id,
    to_date(substring(btrim(invoice_no) from 3 for 8), 'YYYYMMDD') AS invoice_ymd
  FROM (VALUES
    ('Asoke', 'IV20260630-1879', 12),
    ('Asoke', 'IV20260721-2045', 8),
    ('Asoke', 'IV20260811-2262', 12),
    ('Asoke', 'IV20260901-2448', 12),
    ('Bangna', 'IV20260824-2400', 5),
    ('Bangna', 'IV20260818-2292', 4),
    ('Bangna', 'IV20260803-2171', 8),
    ('Bangna', 'IV20260721-2051', 4),
    ('Bangna', 'IV20260720-2039', 2),
    ('Bangna', 'IV20260710-1981', 3),
    ('At Ekkamai', 'IV20260912-2596', 3),
    ('At Ekkamai', 'IV20260907-2525', 2),
    ('At Ekkamai', 'IV20260901-2493', 3),
    ('At Ekkamai', 'IV20260827-2450', 2),
    ('At Ekkamai', 'IV20260821-2399', 2),
    ('At Ekkamai', 'IV20260818-2332', 3),
    ('At Ekkamai', 'IV20260814-2302', 1),
    ('At Ekkamai', 'IV20260807-2233', 4),
    ('At Ekkamai', 'IV20260803-2180', 2),
    ('At Ekkamai', 'IV20260725-2087', 2),
    ('At Ekkamai', 'IV20260721-2061', 1),
    ('At Ekkamai', 'IV20260717-2030', 2),
    ('At Ekkamai', 'IV20260710-1980', 4),
    ('At Ekkamai', 'IV20260703-1922', 3),
    ('At Ekkamai', 'IV20260630-1893', 2),
    ('At Ekkamai', 'IV20260626-1849', 1),
    ('Future', 'IV20260907-2536', 2),
    ('Future', 'IV20260902-2499', 3),
    ('Future', 'IV20260825-2409', 3),
    ('Future', 'IV20260817-2312', 2),
    ('Future', 'IV20260810-2245', 2),
    ('Future', 'IV20260803-2175', 2),
    ('Future', 'IV20260730-2150', 2),
    ('Future', 'IV20260720-2041', 2),
    ('Future', 'IV20260718-2033', 2),
    ('Future', 'IV20260709-1967', 3),
    ('Future', 'IV20260630-1867', 2),
    ('Future', 'IV20260709-1822', 1),
    ('Huamak', 'IV20260916-2628', 1),
    ('Huamak', 'IV20260911-2585', 3),
    ('Huamak', 'IV20260909-2559', 1),
    ('Huamak', 'IV20260905-2529', 1),
    ('Huamak', 'IV20260901-2487', 3),
    ('Huamak', 'IV20260901-2462', 1),
    ('Huamak', 'IV20260826-2434', 1),
    ('Huamak', 'IV20260822-2402', 2),
    ('Huamak', 'IV20260817-2314', 2),
    ('Huamak', 'IV20260811-2271', 3),
    ('Huamak', 'IV20260809-2236', 2),
    ('Huamak', 'IV20260803-2186', 1),
    ('Huamak', 'IV20260730-2157', 2),
    ('Huamak', 'IV20260727-2122', 1),
    ('Huamak', 'IV20260722-2062', 2),
    ('Huamak', 'IV20260717-2020', 2),
    ('Huamak', 'IV20260713-1990', 1),
    ('Huamak', 'IV20260711-1982', 1),
    ('Huamak', 'IV20260709-1956', 2),
    ('Huamak', 'IV20260703-1924', 1),
    ('Huamak', 'IV20260709-1842', 2),
    ('MBK', 'IV20260912-2594', 2),
    ('MBK', 'IV20260911-2561', 2),
    ('MBK', 'IV20260907-2538', 1),
    ('MBK', 'IV20260905-2528', 1),
    ('MBK', 'IV20260906-2505', 2),
    ('MBK', 'IV20260831-2472', 2),
    ('MBK', 'IV20260828-2464', 2),
    ('MBK', 'IV20260824-2404', 1),
    ('MBK', 'IV20260822-2403', 1),
    ('MBK', 'IV20260821-2398', 2),
    ('MBK', 'IV20260817-2310', 4),
    ('MBK', 'IV20260813-2293', 2),
    ('MBK', 'IV20260810-2242', 3),
    ('MBK', 'IV20260807-2229', 2),
    ('MBK', 'IV20260803-2181', 3),
    ('MBK', 'IV20260731-2165', 2),
    ('MBK', 'IV20260730-2140', 2),
    ('MBK', 'IV20260727-2110', 1),
    ('MBK', 'IV20260724-2084', 3),
    ('MBK', 'IV20260720-2038', 3),
    ('MBK', 'IV20260717-2018', 2),
    ('MBK', 'IV20260710-1979', 2),
    ('MBK', 'IV20260707-1938', 3),
    ('MBK', 'IV20260703-1916', 2),
    ('MBK', 'IV20260627-1845', 3),
    ('Seacon', 'IV20260915-2623', 2),
    ('Seacon', 'IV20260911-2592', 2),
    ('Seacon', 'IV20260908-2555', 1),
    ('Seacon', 'IV20260905-2520', 2),
    ('Seacon', 'IV20260902-2488', 2),
    ('Seacon', 'IV20260824-2412', 2),
    ('Seacon', 'IV20260821-2395', 2),
    ('Seacon', 'IV20260819-2334', 2),
    ('Seacon', 'IV20260815-2305', 1),
    ('Seacon', 'IV20260810-2243', 2),
    ('Seacon', 'IV20260809-2235', 1),
    ('Seacon', 'IV20260804-2203', 2),
    ('Seacon', 'IV20260727-2108', 2),
    ('Seacon', 'IV20260724-2096', 3),
    ('Seacon', 'IV20260720-2040', 1),
    ('Seacon', 'IV20260717-2023', 1),
    ('Seacon', 'IV20260712-1976', 2),
    ('Seacon', 'IV20260703-1918', 1),
    ('Seacon', 'IV20260701-1899', 3),
    ('Silom', 'IV20260908-2531', 3),
    ('Silom', 'IV20260831-2470', 3),
    ('Silom', 'IV20260828-2459', 2),
    ('Silom', 'IV20260824-2405', 3),
    ('Silom', 'IV20260820-2383', 3),
    ('Silom', 'IV20260817-2311', 3),
    ('Silom', 'IV20260811-2251', 3),
    ('Silom', 'IV20260805-2170', 3),
    ('Silom', 'IV20260731-2167', 5),
    ('Silom', 'IV20260727-2126', 3),
    ('Silom', 'IV20260727-2083', 3),
    ('Silom', 'IV20260718-2034', 2),
    ('Silom', 'IV20260713-1991', 3),
    ('Silom', 'IV20260711-1983', 3),
    ('Silom', 'IV20260708-1945', 2),
    ('Silom', 'IV20260709-1925', 2),
    ('Silom', 'IV20260709-1891', 1),
    ('The Street', 'IV20260915-2603', 4),
    ('The Street', 'IV20260906-2533', 4),
    ('The Street', 'IV20260901-2484', 4),
    ('The Street', 'IV20260820-2381', 4),
    ('The Street', 'IV20260815-2306', 5),
    ('The Street', 'IV20260811-2241', 5),
    ('The Street', 'IV20260804-2173', 4),
    ('The Street', 'IV20260727-2107', 4),
    ('The Street', 'IV20260720-2035', 4),
    ('The Street', 'IV20260629-1864', 10),
    ('(Excel TRUE — store name blank)', 'IV20260912-2597', 2),
    ('(Excel TRUE — store name blank)', 'IV20260908-2556', 2),
    ('(Excel TRUE — store name blank)', 'IV20260904-2524', 1),
    ('(Excel TRUE — store name blank)', 'IV20260901-2492', 2),
    ('(Excel TRUE — store name blank)', 'IV20260828-2460', 1),
    ('(Excel TRUE — store name blank)', 'IV20260824-2411', 1),
    ('(Excel TRUE — store name blank)', 'IV20260821-2396', 2),
    ('(Excel TRUE — store name blank)', 'IV20260818-2331', 1),
    ('(Excel TRUE — store name blank)', 'IV20260815-2307', 2),
    ('(Excel TRUE — store name blank)', 'IV20260809-2238', 2),
    ('(Excel TRUE — store name blank)', 'IV20260803-2182', 2),
    ('(Excel TRUE — store name blank)', 'IV20260731-2168', 2),
    ('(Excel TRUE — store name blank)', 'IV20260727-2120', 1),
    ('(Excel TRUE — store name blank)', 'IV20260724-2099', 1),
    ('(Excel TRUE — store name blank)', 'IV20260720-2037', 1),
    ('(Excel TRUE — store name blank)', 'IV20260717-2029', 2),
    ('(Excel TRUE — store name blank)', 'IV20260714-1984', 2),
    ('(Excel TRUE — store name blank)', 'IV20260704-1927', 1),
    ('Union', 'IV20260908-2539', 6),
    ('Union', 'IV20260902-2497', 3),
    ('Union', 'IV20260828-2463', 5),
    ('Union', 'IV20260821-2397', 4),
    ('Union', 'IV20260811-2260', 4),
    ('Union', 'IV20260807-2232', 4),
    ('Union', 'IV20260804-2184', 3),
    ('Union', 'IV20260725-2103', 4),
    ('Union', 'IV20260717-2031', 4),
    ('Union', 'IV20260709-1968', 5),
    ('Union', 'IV20260702-1915', 4)
  ) AS t(excel_store, invoice_no, excel_qty)
),
mayo_items AS (
  SELECT btrim(i.code) AS item_code
  FROM public.items i
  WHERE (
     i.name ILIKE '%mayo%'
     OR i.name ILIKE '%mayone%'
     OR i.name ILIKE '%mayonnaise%'
     OR i.spec ILIKE '%mayo%'
   )
   AND (
     i.name ILIKE '%ottogi%'
     OR i.name ILIKE '%3.2%'
     OR i.spec ILIKE '%3.2%'
   )
),
cart_mayo AS (
  SELECT
    r.order_id,
    sum(coalesce((line->>'qty')::numeric, 0)) AS cart_qty,
    round(sum(
      coalesce((line->>'qty')::numeric, 0)
      * coalesce((line->>'price')::numeric, 0)
    ), 2) AS cart_amount_ex_vat,
    string_agg(DISTINCT coalesce(line->>'code', ''), ', ' ORDER BY coalesce(line->>'code', '')) AS cart_codes,
    string_agg(DISTINCT coalesce(line->>'name', ''), ' | ') AS cart_names
  FROM req r
  JOIN public.orders o ON o.id = r.order_id
  CROSS JOIN LATERAL jsonb_array_elements(
    CASE
      WHEN o.cart_json IS NULL OR length(btrim(o.cart_json::text)) = 0 THEN '[]'::jsonb
      WHEN jsonb_typeof(o.cart_json::jsonb) = 'array' THEN o.cart_json::jsonb
      WHEN jsonb_typeof(o.cart_json::jsonb) = 'object'
        THEN coalesce(o.cart_json::jsonb -> 'items', '[]'::jsonb)
      ELSE '[]'::jsonb
    END
  ) AS line
  WHERE
    EXISTS (
      SELECT 1 FROM mayo_items m
      WHERE m.item_code <> '' AND btrim(coalesce(line->>'code', '')) = m.item_code
    )
    OR coalesce(line->>'name', '') ILIKE '%mayo%'
    OR coalesce(line->>'name', '') ILIKE '%mayone%'
    OR coalesce(line->>'name', '') ILIKE '%mayonnaise%'
    OR coalesce(line->>'spec', '') ILIKE '%mayo%'
  GROUP BY r.order_id
),
out_mayo AS (
  SELECT
    r.order_id,
    count(*) FILTER (WHERE coalesce(sl.is_deleted, false) = false) AS outbound_rows_active,
    count(*) FILTER (WHERE coalesce(sl.is_deleted, false) = true) AS outbound_rows_deleted,
    round(sum(abs(coalesce(sl.qty, 0)::numeric)) FILTER (WHERE coalesce(sl.is_deleted, false) = false), 3) AS outbound_qty_active,
    round(sum(
      abs(coalesce(sl.qty, 0)::numeric) * coalesce(sl.invoice_unit_price, 0)::numeric
    ) FILTER (WHERE coalesce(sl.is_deleted, false) = false), 2) AS outbound_amount_ex_vat
  FROM req r
  JOIN public.stock_logs sl
    ON sl.order_id = r.order_id
   AND sl.log_type IN ('Outbound', 'ForceOutbound')
   AND (
     EXISTS (
       SELECT 1 FROM mayo_items m
       WHERE m.item_code <> '' AND btrim(coalesce(sl.item_code, '')) = m.item_code
     )
     OR (
     sl.item_name ILIKE '%mayo%'
     OR sl.item_name ILIKE '%mayone%'
     OR sl.item_name ILIKE '%mayonnaise%'
     OR sl.spec ILIKE '%mayo%'
   )
   )
  GROUP BY r.order_id
)
SELECT
  r.excel_store,
  o.store_name AS order_store,
  r.invoice_no,
  r.excel_qty,
  coalesce(c.cart_qty, 0) AS cart_qty,
  coalesce(om.outbound_qty_active, 0) AS outbound_qty_active,
  coalesce(om.outbound_rows_active, 0) AS outbound_rows_active,
  coalesce(om.outbound_rows_deleted, 0) AS outbound_rows_deleted,
  (coalesce(c.cart_qty, 0) = r.excel_qty) AS cart_qty_matches_excel,
  (coalesce(om.outbound_qty_active, 0) = r.excel_qty) AS outbound_qty_matches_excel,
  c.cart_amount_ex_vat,
  om.outbound_amount_ex_vat,
  c.cart_codes,
  c.cart_names,
  CASE
    WHEN o.id IS NULL THEN 'order_missing'
    WHEN coalesce(c.cart_qty, 0) = 0 AND coalesce(om.outbound_qty_active, 0) = 0 THEN 'no_mayo_on_invoice'
    WHEN coalesce(c.cart_qty, 0) = r.excel_qty AND coalesce(om.outbound_qty_active, 0) = r.excel_qty THEN 'match'
    ELSE 'qty_mismatch'
  END AS check_flag
FROM req r
LEFT JOIN public.orders o ON o.id = r.order_id
LEFT JOIN cart_mayo c ON c.order_id = r.order_id
LEFT JOIN out_mayo om ON om.order_id = r.order_id
ORDER BY check_flag, r.invoice_ymd, r.order_id;
