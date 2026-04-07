-- Lookup for unresolved (store_name, raw_name) pairs — same list as CSV (2).
-- Requires: cm_norm_store / cm_norm_name (run attendance_employee_id_third_pass.sql once).
--
-- Part A only: exact normalized name match (no "whole store as candidates").
-- For spelling-typo cases (Burapin/Buraphin, etc.) run attendance_unresolved_fuzzy_lookup.sql after enabling pg_trgm.

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
-- ---------- Part A: exact match only ----------
exact_hits AS (
  SELECT
    p.store_name,
    p.raw_name,
    p.name_key,
    e.id AS employee_id,
    trim(e.store) AS emp_store,
    trim(e.name) AS emp_name
  FROM pairs p
  JOIN employees e
    ON cm_norm_store(e.store) = p.store_key
   AND p.name_key <> ''
   AND p.name_key = cm_norm_name(e.name)
),
exact_summary AS (
  SELECT
    store_name,
    raw_name,
    count(*)::int AS exact_match_count
  FROM exact_hits
  GROUP BY store_name, raw_name
)
SELECT
  'A_exact'::text AS part,
  h.store_name,
  h.raw_name,
  h.name_key,
  h.employee_id,
  h.emp_store,
  h.emp_name,
  s.exact_match_count
FROM exact_hits h
JOIN exact_summary s USING (store_name, raw_name)
ORDER BY h.store_name, h.raw_name, h.employee_id;
