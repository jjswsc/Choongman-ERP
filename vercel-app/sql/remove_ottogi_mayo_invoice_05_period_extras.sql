-- 5/6 같은 기간 본사 마요네즈 출고 중 엑셀에 없는 건
-- list_flag = not_in_excel 이면 요청 목록 밖 출고. SELECT만. 이것만 복사 → Run.

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
bounds AS (
  SELECT
    ('2026-06-26'::timestamp AT TIME ZONE 'Asia/Bangkok') AS start_ts,
    ('2026-09-17'::timestamp AT TIME ZONE 'Asia/Bangkok') AS end_ts
),
period_out AS (
  SELECT
    sl.id,
    sl.order_id,
    sl.log_type,
    sl.location,
    sl.vendor_target,
    sl.item_code,
    sl.item_name,
    abs(coalesce(sl.qty, 0)::numeric) AS qty_abs,
    sl.invoice_unit_price,
    (sl.log_date AT TIME ZONE 'Asia/Bangkok')::date AS log_ymd_bkk,
    coalesce(sl.is_deleted, false) AS is_deleted
  FROM public.stock_logs sl
  CROSS JOIN bounds b
  WHERE sl.log_date >= b.start_ts
    AND sl.log_date < b.end_ts
    AND sl.log_type IN ('Outbound', 'ForceOutbound')
    AND coalesce(sl.is_deleted, false) = false
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
)
SELECT
  po.log_ymd_bkk,
  po.log_type,
  po.order_id,
  CASE
    WHEN po.order_id IS NOT NULL
      THEN 'IV' || to_char(po.log_ymd_bkk, 'YYYYMMDD') || '-' || po.order_id::text
    ELSE NULL
  END AS inferred_invoice_no,
  r.invoice_no AS excel_invoice_no,
  r.excel_store,
  r.excel_qty,
  po.vendor_target,
  po.item_code,
  po.item_name,
  po.qty_abs,
  po.invoice_unit_price,
  po.id AS stock_log_id,
  CASE
    WHEN r.invoice_no IS NULL THEN 'not_in_excel'
    ELSE 'in_excel'
  END AS list_flag
FROM period_out po
LEFT JOIN req r
  ON r.order_id = po.order_id
ORDER BY list_flag, po.log_ymd_bkk, po.order_id, po.id;
