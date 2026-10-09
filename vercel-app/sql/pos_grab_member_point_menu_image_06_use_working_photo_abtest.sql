-- A/B 테스트(선택): 메뉴 471 사진을 Banban과 같은「이미 Grab에 뜨는」URL로 잠깐 바꿈
-- 손님 앱에 치킨 사진이 뜨면 → 기존 Member 홍보 PNG(2.5MB·글자 많음)를 Grab이 버린 것
-- 그래도 안 뜨면 → 0바트 아이템/카테고리 쪽 Grab 이슈 의심
-- 테스트 후 원복하거나 압축 JPEG로 교체

UPDATE public.pos_menus
SET image = 'https://faxolqgaadcvyeyvrydc.supabase.co/storage/v1/object/public/pos-menu-images/1779157037236-76_Banban.png'
WHERE id = 471;

UPDATE public.pos_delivery_menu_images
SET image_url = 'https://faxolqgaadcvyeyvrydc.supabase.co/storage/v1/object/public/pos-menu-images/1779157037236-76_Banban.png'
WHERE menu_id = 471
  AND app_code = 'grab';
