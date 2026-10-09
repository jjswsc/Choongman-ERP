-- 4/6 CM027 9/8 삭제 출고의 짝 ForcePush(83776) 미리보기
-- ForceOutbound 83777만 삭제되고 ForcePush 83776은 남아 R&B 재고가 +22 과다.
-- 영업 중 실행 가능(SELECT only). 이것만 복사 → Run.

SELECT
  fp.id AS force_push_id,
  fo.id AS force_outbound_id,
  to_char(fp.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') AS ymd_bkk,
  fp.location AS store_location,
  fp.reference_no,
  fp.qty AS push_qty,
  fo.qty AS outbound_qty,
  coalesce(fp.is_deleted, false) AS push_deleted,
  coalesce(fo.is_deleted, false) AS outbound_deleted,
  fo.delete_reason AS outbound_delete_reason
FROM public.stock_logs fp
JOIN public.stock_logs fo
  ON fo.id = 83777
 AND fo.log_type = 'ForceOutbound'
WHERE fp.id = 83776
  AND fp.log_type = 'ForcePush'
  AND fp.reference_no = '08092026';
