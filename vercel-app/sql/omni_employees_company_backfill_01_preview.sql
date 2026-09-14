-- Omni: 직원 company 가 비어 있으면 로그인 목록에는 보이지만 PIN 로그인이 실패할 수 있음
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run (조회만)
-- 충만 레거시 DB에는 실행하지 마세요.

SELECT
  e.id,
  e.store,
  e.name,
  e.company AS employee_company,
  e.tenant_id,
  t.company_name AS tenant_company,
  length(coalesce(e.password, '')) AS pw_len,
  CASE
    WHEN coalesce(e.password, '') LIKE '$2a$%' OR coalesce(e.password, '') LIKE '$2b$%'
      THEN 'hashed'
    WHEN coalesce(e.password, '') = '' THEN 'empty'
    ELSE 'plaintext'
  END AS pw_kind
FROM public.employees e
LEFT JOIN public.tenants t ON t.id = e.tenant_id
WHERE e.tenant_id IS NOT NULL
  AND btrim(e.tenant_id) <> ''
  AND (
    e.company IS NULL
    OR btrim(e.company) = ''
  )
ORDER BY e.id
LIMIT 200;
