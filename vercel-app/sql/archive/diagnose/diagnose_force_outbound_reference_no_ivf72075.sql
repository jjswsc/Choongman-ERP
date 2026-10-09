-- 강제출고 Invoice Reference 미반영 진단
-- IVF20260804-72075 → stock_logs.id = 72075
-- Supabase SQL Editor에서 실행

-- 1) 해당 출고 행에 reference_no가 저장됐는지
SELECT
  id,
  log_type,
  log_date::date AS log_date_bkk,
  vendor_target,
  item_code,
  item_name,
  qty,
  reference_no,
  CASE
    WHEN reference_no IS NULL OR btrim(reference_no) = '' THEN 'MISSING — 인쇄 Reference가 Document No(IVF…)로 보였을 수 있음'
    ELSE 'OK — 배포 후 재인쇄 시 이 값이 Reference에 나와야 함'
  END AS diagnosis
FROM stock_logs
WHERE id = 72075
   OR (
     log_type = 'ForceOutbound'
     AND id::text = split_part('IVF20260804-72075', '-', 2)
   );

-- 2) 같은 날 R&B 강제출고 중 reference_no 비어 있는 건
SELECT
  id,
  to_char(log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD') AS ymd_bkk,
  vendor_target,
  item_code,
  qty,
  reference_no,
  'IVF' || to_char(log_date AT TIME ZONE 'Asia/Bangkok', 'YYYYMMDD') || '-' || id::text AS invoice_no
FROM stock_logs
WHERE log_type = 'ForceOutbound'
  AND COALESCE(is_deleted, false) = false
  AND (log_date AT TIME ZONE 'Asia/Bangkok')::date = DATE '2026-08-04'
  AND vendor_target ILIKE '%R&B%'
ORDER BY id;
