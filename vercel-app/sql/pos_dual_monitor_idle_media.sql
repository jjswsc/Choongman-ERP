-- 고객화면 평상시 배경 이미지·동영상 URL
ALTER TABLE public.pos_printer_settings
  ADD COLUMN IF NOT EXISTS customer_display_idle_media_type TEXT DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS customer_display_idle_media_url TEXT DEFAULT '';

COMMENT ON COLUMN public.pos_printer_settings.customer_display_idle_media_type IS 'none | image | video';
COMMENT ON COLUMN public.pos_printer_settings.customer_display_idle_media_url IS 'Supabase Storage 공개 URL 등';
