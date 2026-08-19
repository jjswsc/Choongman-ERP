-- jrinter 로그인 연결 확인
-- ⚠️ Omni Supabase에서만 실행. 충만 DB 금지.

SELECT
  e.id,
  e.company,
  e.store,
  e.name,
  e.role,
  p.id AS partner_id,
  p.name AS partner_name
FROM public.employees e
JOIN public.saas_partner_users pu ON pu.employee_id = e.id
JOIN public.saas_partners p ON p.id = pu.partner_id
WHERE trim(e.store) = 'Partner'
  AND trim(e.name) = 'admin';
