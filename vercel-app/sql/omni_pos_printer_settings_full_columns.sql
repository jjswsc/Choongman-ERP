-- ============================================================
-- omni_pos_printer_settings_full_columns.sql
-- Omni Supabase: savePosPrinterSettings 가 쓰는 컬럼 일괄 추가
--
-- 증상: Error: savePosPrinterSettings: too many missing-column retries
-- 원인: pos_printer_settings 에 앱 patch 컬럼이 40개 이상 없음
-- ⚠️ 충만(레거시) DB에도 실행해도 안전(ADD IF NOT EXISTS)하지만,
--    Omni 전용으로 맞춰 둔 파일입니다.
-- ============================================================

CREATE TABLE IF NOT EXISTS public.pos_printer_settings (
  store_code text NOT NULL PRIMARY KEY,
  kitchen_mode integer DEFAULT 1,
  kitchen1_categories jsonb DEFAULT '[]'::jsonb,
  kitchen2_categories jsonb DEFAULT '[]'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS kitchen_mode integer DEFAULT 1,
  ADD COLUMN IF NOT EXISTS kitchen1_categories jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS kitchen2_categories jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS kitchen3_categories jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS kitchen_route_by_menu jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kitchen_route_by_category jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS kitchen_route_by_category_main jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS auto_stock_deduction boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS packaging_fee numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooking_fresh_max_min integer DEFAULT 10,
  ADD COLUMN IF NOT EXISTS cooking_warning_max_min integer DEFAULT 15,
  ADD COLUMN IF NOT EXISTS cooking_rule_mode text DEFAULT 'elapsed',
  ADD COLUMN IF NOT EXISTS cooking_recipe_warning_diff_min integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooking_recipe_urgent_diff_min integer DEFAULT 5,
  ADD COLUMN IF NOT EXISTS cooking_delay_badge_enabled boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cooking_delay_sound_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS cooking_delay_alert_over_min integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_auto_open boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS check_auto_open boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS linkpos_skip_terminal_for_card boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS drawer_open_option text DEFAULT 'reason_only',
  ADD COLUMN IF NOT EXISTS drawer_pin_hash text NULL,
  ADD COLUMN IF NOT EXISTS logo_print boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_print_timing text DEFAULT 'per_payment',
  ADD COLUMN IF NOT EXISTS customer_receipt_order_details boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS merchant_receipt_order_details boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS cash_payment_receipt boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature_line boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_barcode boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS item_barcode boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS qr_code_option text DEFAULT 'yes',
  ADD COLUMN IF NOT EXISTS discount_separate_print boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS merchant_receipt_print boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS actual_order_details boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS topping_options_print boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS hide_buffet_included_on_guest_bill boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_receipt_on_order boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_receipt_on_add_order boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_receipt_on_payment boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_kitchen_slip_on_order boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_final_order_before_payment boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_kitchen_slip_on_cancel boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_print_check_bill_on_cancel boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_biz_name text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_biz_tax_id text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_biz_abn text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_biz_owner text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_biz_address text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_biz_phone text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_show_biz_address boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS receipt_design_style text DEFAULT 'badge',
  ADD COLUMN IF NOT EXISTS receipt_logo_size text DEFAULT 'md',
  ADD COLUMN IF NOT EXISTS receipt_show_title boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_paid_stamp boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_thank_you boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_show_customer_copy boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_footer_primary_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_footer_secondary_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_logo_image_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_stamp_image_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_show_stamp boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_stamp_only_tax_invoice boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_image_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_link_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_membership_qr_text text DEFAULT '',
  ADD COLUMN IF NOT EXISTS receipt_show_membership_qr boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS kitchen_slip_font_scale text DEFAULT 'md',
  ADD COLUMN IF NOT EXISTS kitchen_slip_show_line_notes boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS kitchen_slip_show_order_memo boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS kitchen_slip_option_group_print jsonb NOT NULL DEFAULT
    '{"size": true, "part": true, "flavor": true, "side": true, "other": true}'::jsonb,
  ADD COLUMN IF NOT EXISTS kitchen_slip_print_lang text,
  ADD COLUMN IF NOT EXISTS receipt_print_lang text,
  ADD COLUMN IF NOT EXISTS receipt_inset_left_mm numeric,
  ADD COLUMN IF NOT EXISTS receipt_inset_right_mm numeric,
  ADD COLUMN IF NOT EXISTS receipt_content_nudge_left_mm numeric,
  ADD COLUMN IF NOT EXISTS kitchen_slip_padding_left_mm numeric,
  ADD COLUMN IF NOT EXISTS kitchen_slip_padding_right_mm numeric,
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_kitchen_html boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_hall_order_html boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS esc_pos_cut_after_payment_receipt_html boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_rate numeric DEFAULT 7,
  ADD COLUMN IF NOT EXISTS vat_mode text DEFAULT 'included',
  ADD COLUMN IF NOT EXISTS service_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS service_mode text DEFAULT 'separate',
  ADD COLUMN IF NOT EXISTS card_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS card_mode text DEFAULT 'separate',
  ADD COLUMN IF NOT EXISTS card_base_mode text DEFAULT 'card_only',
  ADD COLUMN IF NOT EXISTS other_rate numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_mode text DEFAULT 'separate',
  ADD COLUMN IF NOT EXISTS fee_stack_mode text DEFAULT 'parallel',
  ADD COLUMN IF NOT EXISTS fee_stack_order jsonb DEFAULT '["service","vat","other"]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_total_rounding_mode text DEFAULT 'round',
  ADD COLUMN IF NOT EXISTS round_payment_total_to_whole_baht boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS require_guest_count boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS dual_monitor_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS customer_display_auto_open boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_display_monitor_preference text DEFAULT 'secondary-first',
  ADD COLUMN IF NOT EXISTS customer_display_lang_mode text DEFAULT 'follow-pos',
  ADD COLUMN IF NOT EXISTS customer_display_lang_override text DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_display_theme text DEFAULT 'dark',
  ADD COLUMN IF NOT EXISTS customer_display_default_state text DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS customer_display_idle_message text DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_display_payment_message text DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_display_qr_payload text DEFAULT '',
  ADD COLUMN IF NOT EXISTS customer_display_show_order_summary boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_display_show_order_total boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS customer_display_idle_media_type text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS customer_display_idle_media_url text DEFAULT '',
  ADD COLUMN IF NOT EXISTS main_device_max_count integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS order_device_max_count integer NOT NULL DEFAULT 8,
  ADD COLUMN IF NOT EXISTS main_device_role_locked boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS main_device_token text,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now();

-- RLS (없으면 저장 시 42501)
ALTER TABLE public.pos_printer_settings ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.pos_printer_settings TO anon, authenticated;
DROP POLICY IF EXISTS "pos_printer_settings_allow_public" ON public.pos_printer_settings;
CREATE POLICY "pos_printer_settings_allow_public"
  ON public.pos_printer_settings
  FOR ALL
  USING (true)
  WITH CHECK (true);

-- 주방 주문 자동인쇄 ON 매장 → 취소 주방도 ON
-- (컬럼 DEFAULT false만 두면 부분취소 시 주방 취소 슬립이 안 나감)
UPDATE public.pos_printer_settings
SET auto_print_kitchen_slip_on_cancel = true
WHERE COALESCE(auto_print_kitchen_slip_on_order, false) = true
  AND COALESCE(auto_print_kitchen_slip_on_cancel, false) = false;

-- 확인
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pos_printer_settings'
ORDER BY column_name;
