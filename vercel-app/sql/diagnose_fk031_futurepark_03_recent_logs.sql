-- 3/3 조회만 — FK031 Future Park 최근 입출·조정 로그 (수량·일시·유형)
-- 조정(Adjustment) +10/-10·미래일자 여부 확인. 이것만 복사 → Run

SELECT
  sl.id,
  sl.log_date,
  sl.location,
  sl.log_type,
  sl.qty,
  sl.vendor_target AS memo,
  sl.item_name,
  sl.spec,
  sl.is_deleted
FROM public.stock_logs sl
WHERE sl.item_code = 'FK031'
  AND (sl.is_deleted IS NULL OR sl.is_deleted = false)
  AND (
    sl.location ILIKE 'CM Future Park'
    OR sl.location ILIKE 'Future Park'
    OR sl.location ILIKE '%Future Park%'
    OR sl.location ILIKE '%ฟิวเจอร์%'
  )
ORDER BY sl.log_date DESC NULLS LAST, sl.id DESC
LIMIT 80;
