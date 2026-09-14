-- Omni: 빈 employees.company 를 tenants.company_name 으로 채움
-- 사전: omni_employees_company_backfill_01_preview.sql 로 대상 확인
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 마세요.

UPDATE public.employees e
SET company = t.company_name
FROM public.tenants t
WHERE t.id = e.tenant_id
  AND btrim(coalesce(t.company_name, '')) <> ''
  AND (
    e.company IS NULL
    OR btrim(e.company) = ''
  );
