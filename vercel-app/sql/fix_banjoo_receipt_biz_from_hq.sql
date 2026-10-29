-- banjoo store 1000: 영수증 상호가 충만(GACHI)으로 잘못 저장된 행을
-- 같은 테넌트 vendors HQ(BANJOO INTERNATIONAL) 값으로 맞춘다.
-- 로고 URL은 비워 둔다(미업로드 = 인쇄 시 로고 없음. Omni는 충만 company-stamp 폴백 제거 배포 후).
--
-- 미리보기: diagnose_banjoo_receipt_logo_biz_01.sql / _02.sql
-- 영업 중 POS Realtime 대량 재인쇄와 무관(pos_printer_settings만 UPDATE).

UPDATE public.pos_printer_settings p
SET
  receipt_biz_name = nullif(btrim(v.name), ''),
  receipt_biz_tax_id = nullif(btrim(v.tax_id), ''),
  receipt_biz_address = nullif(btrim(v.addr), ''),
  receipt_biz_phone = nullif(btrim(v.phone), ''),
  receipt_biz_owner = nullif(btrim(v.ceo), ''),
  updated_at = now()
FROM public.vendors v
WHERE lower(btrim(p.tenant_id)) = 'banjoo'
  AND lower(btrim(p.store_code)) = '1000'
  AND lower(btrim(v.tenant_id)) = 'banjoo'
  AND lower(btrim(coalesce(v.code, ''))) = 'hq'
  AND (
    p.receipt_biz_name ILIKE '%GACHI%'
    OR p.receipt_biz_tax_id = '0105566113264'
    OR nullif(btrim(p.receipt_biz_name), '') IS NULL
  );

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('fix_banjoo_receipt_biz_from_hq.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
