-- 미리보기만. True(CM True Digital) 당일 예약금 원장 — ปิดยอด「เงินสดมัดจำวันนี้」원인 확인.
-- 영업 창: 2026-11-25 05:00 ~ 2026-11-26 05:00 (방콕). 날짜만 바꿔 Run.

SELECT
  id,
  (created_at AT TIME ZONE 'Asia/Bangkok') AS created_bkk,
  store_code,
  member_id,
  guest_phone,
  guest_name,
  kind,
  amount,
  tender,
  memo,
  created_by
FROM public.pos_deposit_ledger
WHERE store_code ILIKE 'CM True Digital'
  AND created_at >= (TIMESTAMP '2026-11-25 05:00:00' AT TIME ZONE 'Asia/Bangkok')
  AND created_at < (TIMESTAMP '2026-11-26 05:00:00' AT TIME ZONE 'Asia/Bangkok')
ORDER BY id;
