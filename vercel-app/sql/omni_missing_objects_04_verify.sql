-- Omni — omni_missing_objects_03_apply.sql 실행 후 확인 (모두 true 여야 함)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'employee_id'
  ) AS leave_requests_has_employee_id,
  to_regclass('public.marketing_materials') IS NOT NULL AS has_marketing_materials,
  to_regclass('public.marketing_material_deployments') IS NOT NULL AS has_marketing_material_deployments,
  to_regclass('public.marketing_material_gifts') IS NOT NULL AS has_marketing_material_gifts,
  EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'marketing_material_store_checks_material_id_fkey'
  ) AS store_checks_has_material_fk;
