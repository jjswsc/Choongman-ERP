-- Omni Supabase만. 1번 조회에서 name=admin, pin_state=empty 인 행이 맞을 때만 실행.
-- PIN 9999. 이미 PIN이 있는 행은 바꾸지 않는다.

UPDATE public.employees e
SET password = '$2b$10$kYL4k1tkzpqSb/92fqzEiOYNX8kvYkw9eEjoxclWWkIN4tjDXqlam'
WHERE lower(btrim(e.name)) = 'admin'
  AND e.deleted_at IS NULL
  AND (e.password IS NULL OR btrim(e.password) = '')
  AND (
    e.tenant_id = 'marubkk'
    OR e.tenant_id IN (
      SELECT t.id
      FROM public.tenants t
      WHERE t.id = 'marubkk'
         OR lower(t.company_name) LIKE '%marubkk%'
    )
  )
RETURNING e.id, e.tenant_id, e.store, e.name, e.role;
