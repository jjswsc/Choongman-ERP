-- 2/2 유령 ForcePush 소프트삭제 (재고조정으로 이미 상쇄한 A-001 제외)
-- 1/2에서 action=삭제대상 인 행만. pos_orders 아님.
-- 미리보기 확인 후 이것만 복사 → Run.

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
    btrim(coalesce(sl.item_code, '')) AS item_code,
    btrim(coalesce(sl.location, '')) AS store_location,
    btrim(coalesce(sl.reference_no, '')) AS reference_no,
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
),
to_delete AS (
  SELECT fp.id
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
  WHERE fp.rn_newest_first > coalesce(fo.live_fo_cnt, 0)
)
UPDATE public.stock_logs s
SET
  is_deleted = true,
  deleted_at = now(),
  deleted_by = 'system-repair · orphan ForcePush after deleted ForceOutbound',
  delete_reason = '강제출고 삭제 시 짝 ForcePush 미삭제 보정 (재고조정 미상쇄분)'
FROM to_delete d
WHERE s.id = d.id
  AND s.log_type = 'ForcePush'
  AND coalesce(s.is_deleted, false) = false
RETURNING s.id, s.item_code, s.location, s.reference_no, s.qty, s.is_deleted;
