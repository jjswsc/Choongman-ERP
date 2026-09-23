-- 매장별 품절 테이블 존재 여부만 확인

select to_regclass('public.pos_menu_store_sold_out') is not null as table_exists;
