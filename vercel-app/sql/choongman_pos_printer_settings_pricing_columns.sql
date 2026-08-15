-- ============================================================
-- choongman_pos_printer_settings_pricing_columns.sql
-- 충만(레거시) Supabase — POS 최종가격 컬럼 (42703)
--
-- 대상: faxolqgaadcvyeyvrydc (충만 ERP)
-- 증상: column pos_printer_settings.{card_base_mode,fee_stack_*,
--       payment_total_rounding_mode,round_payment_total_to_whole_baht}
--       does not exist
--
-- 앱은 없는 컬럼을 빼고 재시도하므로 POS는 기본값으로 동작하지만,
-- 로그가 쌓이고 매장 최종가격(카드 기준·누적·반올림) 설정이 저장되지 않음.
-- ============================================================

ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS card_base_mode TEXT DEFAULT 'card_only',
  ADD COLUMN IF NOT EXISTS fee_stack_mode TEXT DEFAULT 'parallel',
  ADD COLUMN IF NOT EXISTS fee_stack_order JSONB DEFAULT '["service","vat","other"]'::jsonb,
  ADD COLUMN IF NOT EXISTS payment_total_rounding_mode TEXT DEFAULT 'round',
  ADD COLUMN IF NOT EXISTS round_payment_total_to_whole_baht BOOLEAN DEFAULT true;

COMMENT ON COLUMN public.pos_printer_settings.card_base_mode IS
  'card_only | card_plus_vat | card_plus_vat_service';
COMMENT ON COLUMN public.pos_printer_settings.fee_stack_mode IS
  'parallel=각각 기준금액에 독립 계산 | sequential=fee_stack_order 순서로 누적';
COMMENT ON COLUMN public.pos_printer_settings.fee_stack_order IS
  'sequential일 때 적용 순서 JSON 배열. 예: ["service","vat","other"]';
COMMENT ON COLUMN public.pos_printer_settings.payment_total_rounding_mode IS
  'POS payment total rounding: round | floor | none';
COMMENT ON COLUMN public.pos_printer_settings.round_payment_total_to_whole_baht IS
  'deprecated: payment_total_rounding_mode 사용. true=round, false=none';

-- 확인
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'pos_printer_settings'
  AND column_name IN (
    'card_base_mode',
    'fee_stack_mode',
    'fee_stack_order',
    'payment_total_rounding_mode',
    'round_payment_total_to_whole_baht'
  )
ORDER BY column_name;
