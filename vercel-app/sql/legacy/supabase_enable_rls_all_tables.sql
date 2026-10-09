-- ============================================================
-- RLS 활성화: PostgREST로 노출된 public 테이블에 RLS 적용
--
-- Supabase Database Linter 오류(rls_disabled_in_public) 해결용.
-- RLS만 켜고 허용 정책은 추가하지 않음 → anon 키로 접근 시 모두 차단.
-- 서버는 SUPABASE_SERVICE_ROLE_KEY 사용 시 RLS를 우회하여 정상 접근.
--
-- 실행: Supabase Dashboard → SQL Editor → 붙여넣기 → Run
-- ============================================================

ALTER TABLE public.bank_memo_mapping_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_table_layouts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_promos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_promo_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_coupons ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.marketing_influencers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_memo_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.warehouse_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.receivable_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_printer_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inbound_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bank_transaction_inbound_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales_details ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_sales_imports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_menu_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_menu_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sauces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sauce_ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.invoice_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payable_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.item_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.price_history ENABLE ROW LEVEL SECURITY;
-- Linter CSV 추가 테이블 (없는 테이블은 해당 줄 주석 처리 후 실행)
ALTER TABLE public.line_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.line_import_rows ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_identities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.member_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.card_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pos_till_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expense_accruals ENABLE ROW LEVEL SECURITY;
