-- 적용형. ① 미리보기에서 cash receive 500만 있고 같은 날 refund/forfeit 가 없을 때.
-- 해당 receive 행을 복사해 cash refund 500을 넣음 → 닫ยอด「เงินสดมัดจำวันนี้」순액 0.
-- 이미 forfeit 가 있으면 02(forfeit→refund)만 쓰세요. 이 파일과 함께 쓰면 보유액이 음수가 됩니다.

INSERT INTO public.pos_deposit_ledger (
  tenant_id,
  store_code,
  member_id,
  guest_phone,
  guest_name,
  kind,
  amount,
  tender,
  memo,
  created_by
)
SELECT
  r.tenant_id,
  r.store_code,
  r.member_id,
  r.guest_phone,
  r.guest_name,
  'refund',
  r.amount,
  'cash',
  'fix_test_receive_refund',
  coalesce(nullif(trim(r.created_by), ''), 'hq_fix')
FROM public.pos_deposit_ledger r
WHERE r.store_code ILIKE 'CM True Digital'
  AND r.kind = 'receive'
  AND coalesce(r.tender, 'cash') = 'cash'
  AND r.amount = 500
  AND r.created_at >= (TIMESTAMP '2026-11-25 05:00:00' AT TIME ZONE 'Asia/Bangkok')
  AND r.created_at < (TIMESTAMP '2026-11-26 05:00:00' AT TIME ZONE 'Asia/Bangkok')
  AND NOT EXISTS (
    SELECT 1
    FROM public.pos_deposit_ledger d
    WHERE d.store_code ILIKE r.store_code
      AND d.kind IN ('refund', 'forfeit')
      AND d.amount = r.amount
      AND d.created_at >= (TIMESTAMP '2026-11-25 05:00:00' AT TIME ZONE 'Asia/Bangkok')
      AND d.created_at < (TIMESTAMP '2026-11-26 05:00:00' AT TIME ZONE 'Asia/Bangkok')
      AND (
        (r.member_id IS NOT NULL AND d.member_id = r.member_id)
        OR (
          r.member_id IS NULL
          AND coalesce(d.guest_phone, '') = coalesce(r.guest_phone, '')
        )
      )
  )
ORDER BY r.id DESC
LIMIT 1;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_deposit_true_03_insert_cash_refund_if_receive_only.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
