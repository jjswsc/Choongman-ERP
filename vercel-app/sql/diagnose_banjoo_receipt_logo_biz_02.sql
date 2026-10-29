-- banjoo 본사(vendors HQ) 상호가 충만(GACHI)인지 확인 (미리보기 SELECT)
-- Omni SQL Editor에서 이것만 복사 → Run

SELECT
  v.tenant_id,
  v.code,
  v.type,
  v.name,
  v.tax_id,
  left(coalesce(v.addr, ''), 80) AS addr_preview
FROM public.vendors v
WHERE lower(btrim(coalesce(v.code, ''))) = 'hq'
  AND (
    lower(btrim(coalesce(v.tenant_id, ''))) LIKE '%banjoo%'
    OR lower(btrim(coalesce(v.tenant_id, ''))) = 'banjoo'
  )
ORDER BY v.tenant_id;
