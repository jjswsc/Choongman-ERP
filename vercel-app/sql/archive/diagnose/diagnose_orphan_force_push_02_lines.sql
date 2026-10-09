-- 2/3 1/3에서 과다인 인보이스의 살아 있는 ForcePush 행
-- 매장에 남아 있는 +수량. 영업 중 실행 가능(SELECT only).
-- 이것만 복사 → Run.

WITH keyed AS (
  SELECT
    btrim(coalesce(sl.reference_no, '')) AS reference_no,
    btrim(coalesce(sl.item_code, '')) AS item_code,
    CASE
      WHEN sl.log_type = 'ForcePush' THEN btrim(coalesce(sl.location, ''))
      ELSE btrim(coalesce(sl.vendor_target, ''))
    END AS store_location
  FROM public.stock_logs sl
  WHERE sl.log_type IN ('ForcePush', 'ForceOutbound')
    AND btrim(coalesce(sl.reference_no, '')) <> ''
    AND btrim(coalesce(sl.item_code, '')) <> ''
  GROUP BY 1, 2, 3
  HAVING count(*) FILTER (
    WHERE sl.log_type = 'ForcePush' AND coalesce(sl.is_deleted, false) = false
  ) > count(*) FILTER (
    WHERE sl.log_type = 'ForceOutbound' AND coalesce(sl.is_deleted, false) = false
  )
)
SELECT
  fp.id AS force_push_id,
  to_char(fp.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') AS ymd_bkk,
  btrim(fp.item_code) AS item_code,
  btrim(coalesce(fp.item_name, '')) AS item_name,
  btrim(fp.location) AS store_location,
  btrim(fp.reference_no) AS reference_no,
  fp.qty AS push_qty
FROM public.stock_logs fp
JOIN keyed k
  ON k.reference_no = btrim(coalesce(fp.reference_no, ''))
 AND k.item_code = btrim(coalesce(fp.item_code, ''))
 AND k.store_location = btrim(coalesce(fp.location, ''))
WHERE fp.log_type = 'ForcePush'
  AND coalesce(fp.is_deleted, false) = false
ORDER BY fp.log_date, fp.id;
