-- 3/3 CM027 9/2~9/13 전 location 행 상세 (본사 외 매장 출고·사용 포함)
-- 출고 화면 검색에 안 잡힌 행(삭제·Usage·POS·다른 품목명)을 찾음. 영업 중 실행 가능(SELECT only).
-- 이것만 복사 → Run.

WITH bounds AS (
  SELECT
    ('2026-09-02'::timestamp AT TIME ZONE 'Asia/Bangkok') AS start_ts,
    ('2026-09-14'::timestamp AT TIME ZONE 'Asia/Bangkok') AS end_ts
)
SELECT
  sl.id,
  to_char(sl.log_date AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD HH24:MI') AS ymd_bkk,
  sl.log_type,
  sl.location,
  sl.vendor_target,
  sl.item_code,
  sl.item_name,
  sl.qty,
  sl.order_id,
  sl.reference_no,
  coalesce(sl.is_deleted, false) AS is_deleted,
  sl.deleted_at,
  sl.deleted_by,
  sl.delete_reason
FROM public.stock_logs sl
CROSS JOIN bounds b
WHERE sl.log_date >= b.start_ts
  AND sl.log_date < b.end_ts
  AND (
    upper(btrim(coalesce(sl.item_code, ''))) = 'CM027'
    OR sl.item_name ILIKE '%Key Base%'
    OR sl.item_name ILIKE '%Choongman Power%'
  )
ORDER BY sl.log_date, sl.id;
