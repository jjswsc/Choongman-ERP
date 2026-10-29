-- banjoo(store 1000) 영수증 상호·로고 URL이 어디에 들어 있는지 확인 (미리보기 SELECT)
-- Omni SQL Editor에서 이것만 복사 → Run

SELECT
  p.tenant_id,
  p.store_code,
  p.logo_print,
  nullif(btrim(p.receipt_logo_image_url), '') AS receipt_logo_image_url,
  nullif(btrim(p.receipt_biz_name), '') AS receipt_biz_name,
  nullif(btrim(p.receipt_biz_tax_id), '') AS receipt_biz_tax_id,
  left(coalesce(p.receipt_biz_address, ''), 80) AS receipt_biz_address_preview
FROM public.pos_printer_settings p
WHERE lower(btrim(p.store_code)) = '1000'
  AND (
    lower(btrim(coalesce(p.tenant_id, ''))) LIKE '%banjoo%'
    OR lower(btrim(coalesce(p.tenant_id, ''))) = 'banjoo'
  )
ORDER BY p.tenant_id;
