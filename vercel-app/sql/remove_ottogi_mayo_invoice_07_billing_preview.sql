-- 7/9 청구 인보이스(미수)만 제거 — 미리보기
-- 재고 출고·매장 입고 수량은 그대로. JD032 장바구니 단가를 0으로 두면 이후 미수 재동기화가 다시 안 생김.
-- 출고 로그 invoice_unit_price 도 0으로 바꿀 예정(인쇄 인보이스·본사 출고매출). qty 는 안 바꿈.
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
order_cart AS (
  SELECT
    r.order_id,
    r.excel_store,
    r.invoice_no,
    r.excel_qty,
    r.invoice_ymd,
    o.id AS order_found,
    o.store_name,
    o.subtotal AS order_subtotal,
    o.vat AS order_vat,
    o.total AS order_total,
    CASE
      WHEN o.cart_json IS NULL OR length(btrim(o.cart_json::text)) = 0 THEN '[]'::jsonb
      WHEN jsonb_typeof(o.cart_json::jsonb) = 'array' THEN o.cart_json::jsonb
      WHEN jsonb_typeof(o.cart_json::jsonb) = 'object'
        THEN coalesce(o.cart_json::jsonb -> 'items', '[]'::jsonb)
      ELSE '[]'::jsonb
    END AS cart,
    CASE
      WHEN o.cart_json IS NULL THEN 'array'
      WHEN jsonb_typeof(o.cart_json::jsonb) = 'object' THEN 'object'
      ELSE 'array'
    END AS cart_shape,
    o.cart_json::jsonb AS cart_raw
  FROM req r
  JOIN public.orders o ON o.id = r.order_id
),
ds_ident AS (
  SELECT DISTINCT btrim(x) AS ident
  FROM public.vendors v
  CROSS JOIN LATERAL unnest(ARRAY[v.code, v.name, v.gps_name, v.sales_outlet]) AS x
  WHERE coalesce(v.direct_settlement, false) = true
    AND btrim(coalesce(x, '')) <> ''
),
cart_line AS (
  SELECT
    oc.order_id,
    ord,
    elem,
    btrim(coalesce(elem->>'code', '')) AS item_code,
    coalesce((elem->>'qty')::numeric, 0) AS qty,
    coalesce(nullif(elem->>'price', '')::numeric, 0) AS price,
    coalesce(elem->>'taxType', i.tax) AS tax_type,
    btrim(coalesce(i.vendor, '')) AS item_vendor
  FROM order_cart oc
  CROSS JOIN LATERAL jsonb_array_elements(oc.cart) WITH ORDINALITY AS t(elem, ord)
  LEFT JOIN public.items i ON i.code = btrim(coalesce(elem->>'code', ''))
),
line_flag AS (
  SELECT
    cl.*,
    (cl.item_code = 'JD032') AS is_mayo,
    EXISTS (
      SELECT 1 FROM ds_ident d WHERE d.ident = cl.item_vendor
    ) AS is_direct
  FROM cart_line cl
),
order_plan AS (
  SELECT
    oc.order_id,
    oc.excel_store,
    oc.invoice_no,
    oc.excel_qty,
    oc.invoice_ymd,
    oc.store_name,
    oc.order_subtotal,
    oc.order_vat,
    oc.order_total,
    oc.cart_shape,
    oc.cart_raw,
    oc.cart,
    round(coalesce(sum(lf.qty) FILTER (WHERE lf.is_mayo), 0), 3) AS mayo_qty,
    round(coalesce(sum(lf.price * lf.qty) FILTER (WHERE lf.is_mayo), 0), 2) AS mayo_ex_vat,
    round(coalesce(sum(lf.price * lf.qty) FILTER (WHERE NOT lf.is_mayo AND NOT lf.is_direct), 0), 2) AS remaining_hq_ex_vat,
    string_agg(DISTINCT lf.item_code, ', ' ORDER BY lf.item_code)
      FILTER (WHERE NOT lf.is_mayo AND lf.item_code <> '') AS remaining_codes
  FROM order_cart oc
  LEFT JOIN line_flag lf ON lf.order_id = oc.order_id
  GROUP BY
    oc.order_id, oc.excel_store, oc.invoice_no, oc.excel_qty, oc.invoice_ymd,
    oc.store_name, oc.order_subtotal, oc.order_vat, oc.order_total,
    oc.cart_shape, oc.cart_raw, oc.cart
),
ar_plan AS (
  SELECT
    p.*,
    round(p.remaining_hq_ex_vat * 0.07, 2) AS remaining_hq_vat,
    round(p.remaining_hq_ex_vat + round(p.remaining_hq_ex_vat * 0.07, 2), 2) AS remaining_hq_inc_vat,
    round(p.mayo_ex_vat * 1.07, 2) AS mayo_inc_vat,
    rt.id AS rec_id,
    rt.amount AS rec_amount,
    rt.invoice_no AS rec_invoice_no,
    rt.receive_checked,
    rt.bank_transaction_id,
    CASE
      WHEN rt.id IS NULL THEN 'skip_no_ar'
      WHEN rt.bank_transaction_id IS NOT NULL THEN 'skip_bank_linked'
      WHEN round(p.remaining_hq_ex_vat + round(p.remaining_hq_ex_vat * 0.07, 2), 2) > 0
        THEN 'update_ar_remaining'
      ELSE 'delete_ar'
    END AS planned_action
  FROM order_plan p
  LEFT JOIN public.receivable_transactions rt
    ON rt.ref_type = 'Order'
   AND rt.ref_id = p.order_id
)
SELECT
  a.excel_store,
  a.store_name AS order_store,
  a.invoice_no,
  a.order_id,
  a.rec_id,
  a.rec_invoice_no,
  a.rec_amount,
  a.receive_checked,
  a.bank_transaction_id,
  a.mayo_qty,
  a.mayo_ex_vat,
  a.mayo_inc_vat,
  a.remaining_hq_ex_vat,
  a.remaining_hq_inc_vat,
  a.remaining_codes,
  a.order_subtotal,
  a.order_vat,
  a.order_total,
  a.planned_action
FROM ar_plan a
ORDER BY
  CASE a.planned_action
    WHEN 'skip_bank_linked' THEN 0
    WHEN 'update_ar_remaining' THEN 1
    WHEN 'skip_no_ar' THEN 2
    ELSE 3
  END,
  a.invoice_ymd,
  a.order_id;
