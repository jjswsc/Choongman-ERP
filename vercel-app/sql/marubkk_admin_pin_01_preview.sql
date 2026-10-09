-- Omni Supabase만. 충만 DB에서 실행하지 말 것.
-- marubkk 직원과 PIN 유무 확인. 변경 없음.

SELECT e.id,
       e.tenant_id,
       e.company,
       e.store,
       e.name,
       e.role,
       e.employee_code,
       CASE
         WHEN e.password IS NULL OR btrim(e.password) = '' THEN 'empty'
         ELSE 'set'
       END AS pin_state
FROM public.employees e
WHERE e.deleted_at IS NULL
  AND (
    e.tenant_id = 'marubkk'
    OR lower(btrim(coalesce(e.company, ''))) LIKE '%marubkk%'
    OR e.tenant_id IN (
      SELECT t.id
      FROM public.tenants t
      WHERE t.id = 'marubkk'
         OR lower(t.company_name) LIKE '%marubkk%'
    )
  )
ORDER BY e.id;
