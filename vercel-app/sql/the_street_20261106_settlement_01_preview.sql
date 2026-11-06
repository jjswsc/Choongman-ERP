-- 1/2 조회 — CM The street 2026-11-06 결산 마감 잠금 여부 (변경 없음)
-- 증상: บันทึกไม่สำเร็จ / Save 비활성 · 권종 합 7,338인데 cash_actual=5,000·closed=true

SELECT
  id,
  store_code,
  settle_date,
  closed,
  cash_actual,
  cash_amt,
  updated_at,
  left(coalesce(memo, ''), 200) AS memo_head
FROM public.pos_settlements
WHERE store_code ILIKE '%The street%'
  AND settle_date = '2026-11-06'
ORDER BY id;
