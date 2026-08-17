-- Supabase Database Linter 하드ening (충만·Omni 공통) — SQL Editor 1회 실행
--
-- 1) 0011 function_search_path_mutable — public 함수에 search_path 고정 (동작 동일)
-- 2) 0028/0029 anon·authenticated SECURITY DEFINER RPC — service_role 전용 EXECUTE
--
-- 앱(Vercel API)은 SUPABASE_SERVICE_ROLE_KEY로 RPC 호출 → 운영 영향 없음.
-- RLS always-true(0024), vector in public(0014), storage listing(0025)는 별도 설계 작업.
--
-- idempotent: 없는 함수·오버로드는 건너뜀.

-- ---------------------------------------------------------------------------
-- §1 search_path 고정 (오버로드 포함 일괄)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  fn_names text[] := ARRAY[
    -- 기존 supabase_linter_function_search_path_fix.sql
    'touch_attendance_employee_manual_map_updated_at',
    'cm_norm_store',
    'cm_norm_name',
    'eval_json_total_score',
    'get_evaluation_analytics',
    'set_members_updated_at',
    'get_store_stock',
    'get_stock_logs_purchase_agg',
    -- Linter 0011 (2025-06 Supabase Dashboard)
    'pos_sales_business_ymd',
    'pos_sales_business_ymd_from_clock',
    'pos_sales_analytics_base',
    'touch_pos_close_runs_updated_at',
    'get_pos_close_snapshot',
    'set_row_updated_at',
    'normalize_pos_option_group_code',
    'set_pos_option_group_code',
    'get_kt20k_monthly_agg',
    'block_pos_order_events_mutation',
    'touch_pos_print_jobs_updated_at',
    'get_thai_tax_filing_summary_agg',
    'pos_sales_norm_store_key',
    'pos_sales_is_office_store',
    'get_kt20k_employee_diff_top',
    'pos_sales_resolve_discount',
    'pos_sales_order_type_allowed',
    'get_member_crm_summary',
    'get_vat_draft_totals_by_window',
    'get_member_signup_store_stats',
    'get_pos_channel_settlement_gross',
    'trg_hr_policies_set_updated_at',
    'get_hq_warehouse_stock_movement_agg',
    'sync_pos_menu_ingredients_menu_code',
    'get_pos_paid_totals_by_window',
    'get_ai_store_hq_purchase_ratio',
    'get_accounting_compliance_audit_trend',
    'get_member_rfm_scores',
    'get_member_list_cursor',
    'get_my_notices_page',
    'get_company_hybrid_documents_summary',
    'get_member_visit_analysis',
    'get_work_log_period_summary',
    'search_ai_knowledge_chunks',
    'get_interior_dashboard_summary',
    'soft_delete_outbound_logs',
    'get_work_log_weekly_summary',
    'get_work_log_manager_report_rows',
    'get_work_log_employee_insights',
    'get_pos_sales_period_rows',
    'pos_sales_norm_order_type',
    'pos_sales_store_biz_hours',
    'pos_sales_period_bucket_key',
    'get_pos_sales_analytics_agg',
    'enqueue_pos_print_job',
    'allocate_pos_order_no',
    'get_employees_for_login',
    'get_distinct_stock_locations',
    'get_evaluation_distinct_store_names',
    'get_payable_summary',
    'get_petty_cash_summary',
    'get_receivable_summary',
    'seed_erp_store_aliases',
    'upsert_interior_vendor_directory'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (fn_names)
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('ALTER FUNCTION %s SET search_path = public', r.sig);
  END LOOP;
END $$;

-- ---------------------------------------------------------------------------
-- §2 SECURITY DEFINER RPC — anon/authenticated 직접 호출 차단
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r record;
  rpc_names text[] := ARRAY[
    'allocate_pos_order_no',
    'enqueue_pos_print_job',
    'get_distinct_stock_locations',
    'get_employees_for_login',
    'get_evaluation_distinct_store_names',
    'get_payable_summary',
    'get_petty_cash_summary',
    'get_receivable_summary',
    'get_stock_logs_purchase_agg',
    'get_store_stock',
    'seed_erp_store_aliases',
    'upsert_interior_vendor_directory'
  ];
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (rpc_names)
      AND p.prokind = 'f'
      AND p.prosecdef
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END $$;
