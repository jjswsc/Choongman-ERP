-- 적용형. ① 미리보기(pos_deposit_true_01_preview_today.sql)에서
-- receive 500 + forfeit 500(같은 손님)이 보이면, 「ยกเลิก=몰수」오클릭으로 시재 มัดจำ이 남은 경우.
-- forfeit → refund 로 바꾸면 닫ยอด「เงินสดมัดจำวันนี้」순액이 0이 됨(보유액도 0 유지).
-- 영업 중 POS 켠 상태에서도 원장만 고치므로 Realtime 영수증 재인쇄는 없음.
-- id 는 ① 결과의 forfeit 행 id 로 바꿔 Run.

-- True Digital id=12 (2026-11-25 forfeit 500). 다른 건이면 id만 바꿔 Run.
UPDATE public.pos_deposit_ledger
SET
  kind = 'refund',
  memo = CASE
    WHEN coalesce(trim(memo), '') = '' THEN 'fix_forfeit_to_refund'
    WHEN memo LIKE '%fix_forfeit_to_refund%' THEN memo
    ELSE memo || ' | fix_forfeit_to_refund'
  END
WHERE id = 12
  AND store_code ILIKE 'CM True Digital'
  AND kind = 'forfeit'
RETURNING id, kind, amount, tender, memo;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_deposit_true_02_fix_mistaken_forfeit_to_refund.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
