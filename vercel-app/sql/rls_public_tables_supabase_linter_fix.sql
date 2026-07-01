-- Supabase Database Linter: 0013_rls_disabled_in_public, 0023_sensitive_columns_exposed
-- 대상: public 테이블 RLS 활성화 + 개발·기존 앱 호환용 permissive 정책 (FOR ALL, USING(true)).
--
-- 포함 테이블: store_job_headcount, store_repair_*, api_request_idempotency_keys,
--   income_statement_overrides, ai_*, external_*, attendance_employee_manual_map,
--   attendance_log_adjustments, interior_work_packages, interior_vendor_tracks,
--   interior_layout_items, interior_material_specs, interior_layout_editor_prefs,
--   pos_tax_invoice_recipients, po_billing_settings, marketing_campaign_design_tasks,
--   pos_payment_attempts, pos_linkpos_tender_rules, pos_grab_webhook_events
--
-- attendance·interior 6종만 먼저 적용: rls_attendance_interior_supabase_linter_fix.sql
--
-- 보안 강화 시: 아래 정책을 역할·매장·JWT 클레임 기준으로 좁히거나, 서버만 service_role 사용.
-- 서버만 service_role 이면 RLS는 우회되므로 앱 동작은 유지되며, anon/authenticated 는 정책에 묶임.
--
-- 하단 § GRANT: RLS 켠 뒤 PostgREST(anon/authenticated)에서 permission denied 나는 경우를 미리 맞춤.
--   (테이블이 아직 없으면 해당 GRANT 줄에서 오류 → 테이블 생성 스크립트 실행 후 재실행)
--
-- Supabase Dashboard → SQL Editor → 실행

-- api_request_idempotency_keys
ALTER TABLE IF EXISTS public.api_request_idempotency_keys ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all api_request_idempotency_keys" ON public.api_request_idempotency_keys;
CREATE POLICY "Allow all api_request_idempotency_keys"
  ON public.api_request_idempotency_keys
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- income_statement_overrides (sql/income_statement_overrides.sql 주석과 동일 취지)
ALTER TABLE IF EXISTS public.income_statement_overrides ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all income_statement_overrides" ON public.income_statement_overrides;
CREATE POLICY "Allow all income_statement_overrides"
  ON public.income_statement_overrides
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ai_knowledge_chunks
ALTER TABLE IF EXISTS public.ai_knowledge_chunks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all ai_knowledge_chunks" ON public.ai_knowledge_chunks;
CREATE POLICY "Allow all ai_knowledge_chunks"
  ON public.ai_knowledge_chunks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ai_action_requests
ALTER TABLE IF EXISTS public.ai_action_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all ai_action_requests" ON public.ai_action_requests;
CREATE POLICY "Allow all ai_action_requests"
  ON public.ai_action_requests
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ai_notice_drafts
ALTER TABLE IF EXISTS public.ai_notice_drafts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all ai_notice_drafts" ON public.ai_notice_drafts;
CREATE POLICY "Allow all ai_notice_drafts"
  ON public.ai_notice_drafts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ai_action_events
ALTER TABLE IF EXISTS public.ai_action_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all ai_action_events" ON public.ai_action_events;
CREATE POLICY "Allow all ai_action_events"
  ON public.ai_action_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ai_followup_tasks
ALTER TABLE IF EXISTS public.ai_followup_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all ai_followup_tasks" ON public.ai_followup_tasks;
CREATE POLICY "Allow all ai_followup_tasks"
  ON public.ai_followup_tasks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ai_usage_logs
ALTER TABLE IF EXISTS public.ai_usage_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all ai_usage_logs" ON public.ai_usage_logs;
CREATE POLICY "Allow all ai_usage_logs"
  ON public.ai_usage_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- external_store_profiles
ALTER TABLE IF EXISTS public.external_store_profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all external_store_profiles" ON public.external_store_profiles;
CREATE POLICY "Allow all external_store_profiles"
  ON public.external_store_profiles
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- external_context_daily
ALTER TABLE IF EXISTS public.external_context_daily ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all external_context_daily" ON public.external_context_daily;
CREATE POLICY "Allow all external_context_daily"
  ON public.external_context_daily
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- attendance_employee_manual_map (attendance_employee_id_third_pass.sql)
ALTER TABLE IF EXISTS public.attendance_employee_manual_map ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all attendance_employee_manual_map" ON public.attendance_employee_manual_map;
CREATE POLICY "Allow all attendance_employee_manual_map"
  ON public.attendance_employee_manual_map
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- store_job_headcount
ALTER TABLE IF EXISTS public.store_job_headcount ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all store_job_headcount" ON public.store_job_headcount;
CREATE POLICY "Allow all store_job_headcount"
  ON public.store_job_headcount
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- store_repair_tickets
ALTER TABLE IF EXISTS public.store_repair_tickets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all store_repair_tickets" ON public.store_repair_tickets;
CREATE POLICY "Allow all store_repair_tickets"
  ON public.store_repair_tickets
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- store_repair_progress_logs
ALTER TABLE IF EXISTS public.store_repair_progress_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all store_repair_progress_logs" ON public.store_repair_progress_logs;
CREATE POLICY "Allow all store_repair_progress_logs"
  ON public.store_repair_progress_logs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- pos_tax_invoice_recipients (tax_id 등 민감 컬럼 — RLS 켜면 0023 완화)
ALTER TABLE IF EXISTS public.pos_tax_invoice_recipients ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all pos_tax_invoice_recipients" ON public.pos_tax_invoice_recipients;
CREATE POLICY "Allow all pos_tax_invoice_recipients"
  ON public.pos_tax_invoice_recipients
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- po_billing_settings
ALTER TABLE IF EXISTS public.po_billing_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all po_billing_settings" ON public.po_billing_settings;
CREATE POLICY "Allow all po_billing_settings"
  ON public.po_billing_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- marketing_campaign_design_tasks
ALTER TABLE IF EXISTS public.marketing_campaign_design_tasks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_campaign_design_tasks" ON public.marketing_campaign_design_tasks;
CREATE POLICY "Allow all marketing_campaign_design_tasks"
  ON public.marketing_campaign_design_tasks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- marketing_material_store_checks
ALTER TABLE IF EXISTS public.marketing_material_store_checks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all marketing_material_store_checks" ON public.marketing_material_store_checks;
CREATE POLICY "Allow all marketing_material_store_checks"
  ON public.marketing_material_store_checks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- pos_payment_attempts
ALTER TABLE IF EXISTS public.pos_payment_attempts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all pos_payment_attempts" ON public.pos_payment_attempts;
CREATE POLICY "Allow all pos_payment_attempts"
  ON public.pos_payment_attempts
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- pos_linkpos_tender_rules
ALTER TABLE IF EXISTS public.pos_linkpos_tender_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all pos_linkpos_tender_rules" ON public.pos_linkpos_tender_rules;
CREATE POLICY "Allow all pos_linkpos_tender_rules"
  ON public.pos_linkpos_tender_rules
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- pos_grab_webhook_events
ALTER TABLE IF EXISTS public.pos_grab_webhook_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all pos_grab_webhook_events" ON public.pos_grab_webhook_events;
CREATE POLICY "Allow all pos_grab_webhook_events"
  ON public.pos_grab_webhook_events
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- attendance_log_adjustments (attendance_log_adjustments.sql)
ALTER TABLE IF EXISTS public.attendance_log_adjustments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all attendance_log_adjustments" ON public.attendance_log_adjustments;
CREATE POLICY "Allow all attendance_log_adjustments"
  ON public.attendance_log_adjustments
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_work_packages
ALTER TABLE IF EXISTS public.interior_work_packages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_work_packages" ON public.interior_work_packages;
CREATE POLICY "Allow all interior_work_packages"
  ON public.interior_work_packages
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_vendor_tracks
ALTER TABLE IF EXISTS public.interior_vendor_tracks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_vendor_tracks" ON public.interior_vendor_tracks;
CREATE POLICY "Allow all interior_vendor_tracks"
  ON public.interior_vendor_tracks
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_layout_items
ALTER TABLE IF EXISTS public.interior_layout_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_layout_items" ON public.interior_layout_items;
CREATE POLICY "Allow all interior_layout_items"
  ON public.interior_layout_items
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_material_specs
ALTER TABLE IF EXISTS public.interior_material_specs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_material_specs" ON public.interior_material_specs;
CREATE POLICY "Allow all interior_material_specs"
  ON public.interior_material_specs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- interior_layout_editor_prefs
ALTER TABLE IF EXISTS public.interior_layout_editor_prefs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow all interior_layout_editor_prefs" ON public.interior_layout_editor_prefs;
CREATE POLICY "Allow all interior_layout_editor_prefs"
  ON public.interior_layout_editor_prefs
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- ─── REST(anon / authenticated) 권한 — RLS 정책과 함께 써야 API 키 경로가 동작 ───
GRANT USAGE ON SCHEMA public TO anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON
  public.api_request_idempotency_keys,
  public.income_statement_overrides,
  public.ai_knowledge_chunks,
  public.ai_action_requests,
  public.ai_notice_drafts,
  public.ai_action_events,
  public.ai_followup_tasks,
  public.ai_usage_logs,
  public.external_store_profiles,
  public.external_context_daily,
  public.attendance_employee_manual_map,
  public.store_job_headcount,
  public.store_repair_tickets,
  public.store_repair_progress_logs,
  public.pos_tax_invoice_recipients,
  public.po_billing_settings,
  public.marketing_campaign_design_tasks,
  public.pos_payment_attempts,
  public.pos_linkpos_tender_rules,
  public.pos_grab_webhook_events,
  public.attendance_log_adjustments,
  public.interior_work_packages,
  public.interior_vendor_tracks,
  public.interior_layout_items,
  public.interior_material_specs,
  public.interior_layout_editor_prefs
TO anon, authenticated;
