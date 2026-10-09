-- pos_menu_store_scopes 전체 행 수
-- getPosMenus는 이 테이블을 한 번에 읽습니다. 코드 limit=100000이지만
-- supabaseSelect 상한은 기본 10000이고, PostgREST는 1000만 줄 수도 있습니다.
-- 로직: lib/supabase-server.ts supabaseSelectPageCap, app/api/getPosMenus/route.ts

select
  (select count(*) from public.pos_menu_store_scopes) as scope_row_cnt,
  (
    select count(*)
    from public.pos_menu_store_scopes
    where enabled is distinct from false
  ) as enabled_cnt,
  (select count(*) from public.pos_menus) as menu_cnt;
