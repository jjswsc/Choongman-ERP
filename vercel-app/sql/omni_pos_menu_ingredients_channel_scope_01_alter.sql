-- Omni: 원가 BOM 재료 홀/배달 구분 pos_menu_ingredients.channel_scope
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 충만 레거시 DB에는 실행하지 마세요. (ADD COLUMN IF NOT EXISTS 이므로 재실행은 안전)
-- 기본 both = 기존과 동일 (식재는 홀+배달, 포장재는 배달 원가만)

BEGIN;

ALTER TABLE public.pos_menu_ingredients
  ADD COLUMN IF NOT EXISTS channel_scope text NOT NULL DEFAULT 'both';

UPDATE public.pos_menu_ingredients
SET channel_scope = 'both'
WHERE channel_scope IS NULL OR btrim(channel_scope) = '';

ALTER TABLE public.pos_menu_ingredients
  DROP CONSTRAINT IF EXISTS pos_menu_ingredients_channel_scope_check;

ALTER TABLE public.pos_menu_ingredients
  ADD CONSTRAINT pos_menu_ingredients_channel_scope_check
  CHECK (channel_scope IN ('both', 'hall', 'delivery'));

COMMENT ON COLUMN public.pos_menu_ingredients.channel_scope IS
  'both=공통, hall=홀(매장)만, delivery=배달/포장만. 원가·이론소진·POS 차감에 사용.';

COMMIT;

NOTIFY pgrst, 'reload schema';
