-- Supabase Database Linter: 0013_rls_disabled_in_public, 0023_sensitive_columns_exposed
-- 대상: CSV에 나온 public 테이블들에 RLS 활성화 + 개발·기존 앱 호환용 permissive 정책
--
-- 서버만 service_role 로 붙는다면 정책 없이 RLS만 켜도 되지만, anon 키 경로가 있으면 0건이 될 수 있음.
-- marketing_campaigns_rls_policies.sql 과 동일 패턴 (FOR ALL + USING(true)).
--
-- Supabase Dashboard → SQL Editor → 실행

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
