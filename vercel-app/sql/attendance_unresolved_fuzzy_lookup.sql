-- Fuzzy candidate list for unresolved schedule names vs employees (same 30 pairs as csv2_lookup).
-- Enable: Supabase Dashboard → Database → Extensions → pg_trgm (or run line below once).
CREATE EXTENSION IF NOT EXISTS pg_trgm;

WITH unresolved(store_name, raw_name) AS (
  VALUES
    ('CM Ekkamai', 'Mr.Khun Kham Htee'),
    ('CM Ekkamai', 'Mr.Khun Kyaw That'),
    ('CM Huamak', 'Mr.Khun Myint Kyaw'),
    ('CM Ekkamai', 'Ms. Saengnee Phutthawong'),
    ('CM True Digital', 'Ms. Chanya Chuenchan'),
    ('CM Future Park', 'Mr. Therdsak Nakhajad'),
    ('CM True Digital', 'Ms. Kittiyaphon Burapin'),
    ('CM Union Mall', 'Ms. Saowanee Ampornchaiprateep'),
    ('CM Silom', 'Mr.Soe'),
    ('CM Seacon Srinakarin', 'Ms. Natyawa Manoodam'),
    ('CM The street', 'Choosree Kong keeree'),
    ('CM MBK', 'Ms. Patcharapa Raksa Tham'),
    ('CM The street', 'Htetzawoo'),
    ('CM The street', 'Nay aung'),
    ('CM Silom', 'Ms.Nandar Htwe'),
    ('CM Union Mall', 'Ms .Monrada Klinchan'),
    ('CM True Digital', 'Ms. Jitta Namthon'),
    ('CM Huamak', 'Ms. Phimnipha Chanphirom'),
    ('CM Union Mall', 'Mr. Thanison Sirithanakul'),
    ('CM The street', 'Kyaw Zin Thet'),
    ('CM Future Park', 'Mr. Anucha Phiphitthanaphat'),
    ('CM True Digital', 'miss. aathitaya'),
    ('CM Union Mall', 'Dawruang Somsri'),
    ('CM Union Mall', 'Sdanan Naopech'),
    ('CM Huamak', 'Preawa'),
    ('CM the street', 'manager'),
    ('CM Union Mall', 'Paweena Sueaseenak'),
    ('CM Bangna', 'manager'),
    ('CM Union Mall', 'Mr. Anucha Kawan'),
    ('CM Union Mall', 'Mr. Kufulaz Tonphakdi')
),
pairs AS (
  SELECT
    trim(store_name) AS store_name,
    trim(raw_name) AS raw_name,
    cm_norm_store(store_name) AS store_key,
    cm_norm_name(raw_name) AS name_key
  FROM unresolved
),
exact_cnt AS (
  SELECT p.store_name, p.raw_name, count(*)::int AS c
  FROM pairs p
  JOIN employees e
    ON cm_norm_store(e.store) = p.store_key
   AND p.name_key <> ''
   AND p.name_key = cm_norm_name(e.name)
  GROUP BY p.store_name, p.raw_name
),
need_fuzzy AS (
  SELECT p.*
  FROM pairs p
  LEFT JOIN exact_cnt ec USING (store_name, raw_name)
  WHERE coalesce(ec.c, 0) = 0
    AND lower(trim(p.raw_name)) NOT IN ('manager', '매니저')
),
scored AS (
  SELECT
    p.store_name,
    p.raw_name,
    p.name_key,
    e.id AS employee_id,
    trim(e.name) AS emp_name,
    word_similarity(p.name_key, cm_norm_name(e.name)) AS sim
  FROM need_fuzzy p
  JOIN employees e ON cm_norm_store(e.store) = p.store_key
  WHERE p.name_key <> ''
    AND word_similarity(p.name_key, cm_norm_name(e.name)) > 0.18
),
ranked AS (
  SELECT
    *,
    row_number() OVER (
      PARTITION BY store_name, raw_name
      ORDER BY sim DESC, employee_id
    ) AS rn
  FROM scored
)
SELECT
  store_name,
  raw_name,
  name_key,
  employee_id,
  emp_name,
  round(sim::numeric, 3) AS word_similarity
FROM ranked
WHERE rn <= 8
ORDER BY store_name, raw_name, sim DESC, employee_id;
