-- 5/6 CM027 짝 ForcePush 83776 소프트삭제
-- R&B Food Supply 재고 +22 과다분 제거. pos_orders 아님. 출고 83777과 같은 삭제 건.
-- 미리보기(4/6)에서 push_deleted=false 확인 후 이것만 복사 → Run.

UPDATE public.stock_logs
SET
  is_deleted = true,
  deleted_at = now(),
  deleted_by = 'system-repair · pair of ForceOutbound 83777',
  delete_reason = 'ผิด — ForceOutbound 83777 삭제 시 짝 ForcePush 미삭제 보정'
WHERE id = 83776
  AND log_type = 'ForcePush'
  AND reference_no = '08092026'
  AND coalesce(is_deleted, false) = false
RETURNING id, item_code, qty, location, is_deleted, delete_reason;
