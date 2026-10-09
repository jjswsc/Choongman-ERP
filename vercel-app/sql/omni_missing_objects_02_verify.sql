-- Omni — omni_missing_objects_01_apply.sql 실행 후 확인 (모두 true 여야 함)
SELECT
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'leave_requests' AND column_name = 'reject_reason'
  ) AS leave_requests_has_reject_reason,
  EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'notices' AND column_name = 'target_permission_group'
  ) AS notices_has_target_permission_group,
  to_regclass('public.push_tokens') IS NOT NULL AS has_push_tokens,
  to_regclass('public.pos_menu_boards') IS NOT NULL AS has_pos_menu_boards,
  to_regclass('public.marketing_material_store_checks') IS NOT NULL AS has_marketing_material_store_checks,
  to_regclass('public.store_repair_tickets') IS NOT NULL AS has_store_repair_tickets,
  to_regclass('public.interior_projects') IS NOT NULL AS has_interior_projects,
  to_regprocedure('public.get_interior_dashboard_summary(text)') IS NOT NULL AS has_interior_dashboard_rpc;
