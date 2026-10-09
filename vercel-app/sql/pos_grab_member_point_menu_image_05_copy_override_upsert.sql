-- 실행: 메뉴 471 Grab 이미지를 정책 있는 전 매장에 동일 URL로 upsert
-- (True 포함 — Bangna와 동일 파일)
-- 실행 후 True 등 Grab updateMenuNotification 재푸시 필요

INSERT INTO public.pos_delivery_menu_images (store_code, app_code, menu_id, image_url)
SELECT
  p.store_code,
  'grab',
  471,
  'https://faxolqgaadcvyeyvrydc.supabase.co/storage/v1/object/public/pos-menu-images/1791282246673-471_Delivery-Member2.png'
FROM public.pos_delivery_menu_policies p
WHERE p.menu_id = 471
  AND p.app_code = 'grab'
ON CONFLICT (store_code, app_code, menu_id)
DO UPDATE SET image_url = EXCLUDED.image_url;
