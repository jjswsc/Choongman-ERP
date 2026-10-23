-- 2/4 적용 — 배포 전 임시: 6·8 미결제 QR 홀을 오늘 영업일 스냅샷에 보이게 created_at만 당김
-- 영업 중 OK (status/금액/품목 불변 → 결제 영수증 재인쇄 트리거 없음)
-- 배포(플로어 QR carryover) 후에는 불필요. 이미 보이면 실행하지 말 것.

UPDATE public.pos_orders
SET created_at = now()
WHERE id IN (153230, 153231)
  AND store_code ILIKE '%the street%'
  AND lower(coalesce(status, '')) IN ('pending', 'cooking', 'ready', 'preparing')
  AND paid_at IS NULL;

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('the_street_qr_carryover_floor_02_live_bump_bizday.sql')
    ON CONFLICT (file_name) DO UPDATE
    SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
