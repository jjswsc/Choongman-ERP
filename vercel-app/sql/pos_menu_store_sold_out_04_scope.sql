-- 매장별 품절 범위 (Menu Sold out 화면)
-- scope = 'all'   : 전 채널 품절 (POS·QR·회원 픽업·Grab 등 배달)
-- scope = 'store' : หน้าร้าน만 품절 (POS 홀·포장·QR·회원 픽업) — Grab·POS 배달 주문은 계속 판매
-- 기존 행은 default 'all' 로 채워져 동작이 바뀌지 않는다. pos_orders 는 건드리지 않음.

alter table public.pos_menu_store_sold_out
  add column if not exists scope text not null default 'all';

alter table public.pos_menu_store_sold_out
  drop constraint if exists pos_menu_store_sold_out_scope_check;

alter table public.pos_menu_store_sold_out
  add constraint pos_menu_store_sold_out_scope_check check (scope in ('all', 'store'));

notify pgrst, 'reload schema';

DO $$ BEGIN
 IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
 INSERT INTO public.sql_applied_log (file_name) VALUES ('pos_menu_store_sold_out_04_scope.sql')
 ON CONFLICT (file_name) DO UPDATE
 SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
 END IF;
END $$;
