-- Omni: ABC Company / Marubkk tenant id 확인 (Head Office 공유 원인 조사)
-- 충만 레거시 DB에는 실행하지 마세요.

SELECT
  id,
  company_name,
  is_active,
  created_at
FROM public.tenants
WHERE lower(coalesce(company_name, '')) LIKE '%abc%'
   OR lower(coalesce(company_name, '')) LIKE '%maru%'
   OR lower(coalesce(id, '')) LIKE '%abc%'
   OR lower(coalesce(id, '')) LIKE '%maru%'
ORDER BY company_name, id;
