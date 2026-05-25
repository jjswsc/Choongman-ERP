-- 고객화면 언어: POS 언어 따라감 / 고객화면만 별도 고정
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS customer_display_lang_mode TEXT DEFAULT 'follow-pos',
  ADD COLUMN IF NOT EXISTS customer_display_lang_override TEXT DEFAULT '';

COMMENT ON COLUMN public.pos_printer_settings.customer_display_lang_mode IS 'follow-pos | custom';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_lang_override IS 'ko | en | th | mm | la | kh | vi | ms';
