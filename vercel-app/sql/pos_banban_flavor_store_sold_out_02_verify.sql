-- Banban 맛 전용 품절 테이블 존재 확인
select to_regclass('public.pos_banban_flavor_store_sold_out') is not null as table_exists;
