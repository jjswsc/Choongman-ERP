-- fix_banjoo_receipt_biz_from_hq.sql 실행 후 검증 (미리보기 SELECT)
-- 이것만 복사 → Run

SELECT
  p.tenant_id,
  p.store_code,
  nullif(btrim(p.receipt_biz_name), '') AS receipt_biz_name,
  nullif(btrim(p.receipt_biz_tax_id), '') AS receipt_biz_tax_id,
  left(coalesce(p.receipt_biz_address, ''), 80) AS receipt_biz_address_preview
FROM public.pos_printer_settings p
WHERE lower(btrim(p.tenant_id)) = 'banjoo'
  AND lower(btrim(p.store_code)) = '1000';
