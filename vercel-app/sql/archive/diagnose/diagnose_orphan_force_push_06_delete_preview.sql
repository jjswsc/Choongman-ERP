-- 1/2 유령 ForcePush 삭제 대상 미리보기
-- 살아 있는 강제출고 수만큼 가장 최근 ForcePush만 남김. A-001(이미 재고조정) 제외.
-- 영업 중 실행 가능(SELECT only). 이것만 복사 → Run.

WITH fo_live AS (
  SELECT
    btrim(coalesce(reference_no, '')) AS reference_no,
    btrim(coalesce(item_code, '')) AS item_code,
    btrim(coalesce(vendor_target, '')) AS store_location,
    abs(coalesce(qty, 0)) AS qty_abs,
    count(*)::int AS live_fo_cnt
  FROM public.stock_logs
  WHERE log_type = 'ForceOutbound'
    AND coalesce(is_deleted, false) = false
    AND btrim(coalesce(reference_no, '')) <> ''
    AND btrim(coalesce(item_code, '')) <> ''
  GROUP BY 1, 2, 3, 4
),
fp_live AS (
  SELECT
    sl.id,
    sl.log_date,
    btrim(coalesce(sl.item_code, '')) AS item_code,
    btrim(coalesce(sl.item_name, '')) AS item_name,
    btrim(coalesce(sl.location, '')) AS store_location,
    btrim(coalesce(sl.reference_no, '')) AS reference_no,
    sl.qty,
    abs(coalesce(sl.qty, 0)) AS qty_abs,
    row_number() OVER (
      PARTITION BY
        btrim(coalesce(sl.reference_no, '')),
        btrim(coalesce(sl.item_code, '')),
        btrim(coalesce(sl.location, '')),
        abs(coalesce(sl.qty, 0))
      ORDER BY sl.id DESC
    ) AS rn_newest_first
  FROM public.stock_logs sl
  WHERE sl.log_type = 'ForcePush'
    AND coalesce(sl.is_deleted, false) = false
    AND btrim(coalesce(sl.reference_no, '')) <> ''
    AND btrim(coalesce(sl.item_code, '')) <> ''
    AND NOT (
      btrim(coalesce(sl.item_code, '')) = 'A-001'
      AND lower(btrim(coalesce(sl.location, ''))) = lower('CM Union Mall')
    )
),
orphan_keys AS (
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
  fp.item_code,
  fp.item_name,
  fp.store_location,
  fp.reference_no,
  fp.qty AS push_qty,
  coalesce(fo.live_fo_cnt, 0) AS keep_how_many,
  fp.rn_newest_first,
  CASE
    WHEN fp.rn_newest_first <= coalesce(fo.live_fo_cnt, 0) THEN '남김'
    ELSE '삭제대상'
  END AS action
FROM fp_live fp
JOIN orphan_keys k
  ON k.reference_no = fp.reference_no
 AND k.item_code = fp.item_code
 AND k.store_location = fp.store_location
LEFT JOIN fo_live fo
  ON fo.reference_no = fp.reference_no
 AND fo.item_code = fp.item_code
 AND fo.store_location = fp.store_location
 AND fo.qty_abs = fp.qty_abs
ORDER BY
  CASE WHEN fp.rn_newest_first <= coalesce(fo.live_fo_cnt, 0) THEN 0 ELSE 1 END,
  fp.item_code,
  fp.store_location,
  fp.reference_no,
  fp.id;
