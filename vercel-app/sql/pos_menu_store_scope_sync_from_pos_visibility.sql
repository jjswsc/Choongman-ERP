-- POS 메뉴 화면 노출 → pos_menu_store_scopes 역동기화
--
-- 목적:
--   각 매장 POS 주문 화면에 실제로 보이는 메뉴와 동일하게
--   관리자 「메뉴 정보 > 노출 매장」 체크박스(DB)를 맞춘다.
--
-- 기준 로직 (앱과 동일):
--   vercel-app/app/api/getPosMenus/route.ts
--   vercel-app/lib/pos-menu-store-scope.ts → shouldMenuBeVisibleForStore
--
--   • POS_MENU_SCOPE_COMPATIBILITY_MODE=1(기본):
--       스코프 행이 없는 메뉴 → 전 매장 노출
--       스코프 행이 있는 메뉴 → 지정된 매장만 노출
--   • is_active=false 메뉴는 POS 그리드에서 숨기므로 이번 동기화 대상에서 제외
--
-- 실행 순서:
--   0) §0 테이블 존재 확인 (선택)
--   1) §1 사전 점검
--   2) §2 미리보기
--   3) §4 begin…commit (주석 해제 후 실행)
--   4) §5 사후 검증
--
-- 매장 목록 소스 (존재하는 테이블만 자동 사용):
--   erp_stores, pos_printer_settings, employees, pos_menu_store_scopes
--   (+ pos_menu_screen_configs 는 배포된 DB에만 포함)
--
-- 주의:
--   • Supabase SQL Editor는 쿼리를 §별로 나눠 실행하는 것을 권장 (파일 전체 한 번 실행 X)
--   • 활성 메뉴 스코프를 계산 결과로 교체한다. 비활성 메뉴 스코프는 유지.

-- ═══════════════════════════════════════════════════════════════
-- 0) (선택) 관련 테이블 존재 확인
-- ═══════════════════════════════════════════════════════════════
select
  to_regclass('public.erp_stores') is not null as has_erp_stores,
  to_regclass('public.pos_printer_settings') is not null as has_pos_printer_settings,
  to_regclass('public.employees') is not null as has_employees,
  to_regclass('public.pos_menu_store_scopes') is not null as has_pos_menu_store_scopes,
  to_regclass('public.pos_menu_screen_configs') is not null as has_pos_menu_screen_configs,
  to_regclass('public.pos_menus') is not null as has_pos_menus;

-- ═══════════════════════════════════════════════════════════════
-- 1) 사전 점검 — Results 탭에 표 나옴 (Supabase에서 이 블록 먼저 실행)
--     has_pos_menu_store_scopes=true, has_pos_menus=true 여야 다음 진행
-- ═══════════════════════════════════════════════════════════════
with store_sources as (
  select distinct trim(store_code) as store_code
  from public.pos_menu_store_scopes
  where trim(coalesce(store_code, '')) <> ''
  union
  select distinct trim(store_code)
  from public.erp_stores
  where trim(coalesce(store_code, '')) <> ''
    and coalesce(is_active, true) = true
  union
  select distinct trim(store_code)
  from public.pos_printer_settings
  where trim(coalesce(store_code, '')) <> ''
  union
  select distinct trim(store) as store_code
  from public.employees
  where trim(coalesce(store, '')) <> ''
),
stores as (
  select store_code from store_sources where store_code <> ''
),
menu_stats as (
  select
    pm.id,
    count(pms.store_code) filter (where pms.enabled is distinct from false) as scoped_store_count
  from public.pos_menus pm
  left join public.pos_menu_store_scopes pms on pms.menu_id = pm.id
  where pm.is_active is distinct from false
  group by pm.id
)
select
  (select count(*) from stores) as store_count,
  (select count(*) from menu_stats) as active_menu_count,
  (select count(*) filter (where scoped_store_count = 0) from menu_stats) as active_menus_without_scope,
  (select count(*) filter (where scoped_store_count > 0) from menu_stats) as active_menus_with_scope;

-- ═══════════════════════════════════════════════════════════════
-- 1b) 사전 점검 (DO — Messages 탭에만 표시, §1 SELECT 와 동일 목적)
-- ═══════════════════════════════════════════════════════════════
do $$
declare
  store_count bigint;
  active_menu_count bigint;
  without_scope bigint;
  with_scope bigint;
begin
  if to_regclass('public.pos_menus') is null then
    raise exception 'public.pos_menus 테이블이 없습니다.';
  end if;
  if to_regclass('public.pos_menu_store_scopes') is null then
    raise exception 'public.pos_menu_store_scopes 테이블이 없습니다. DDL 먼저 배포하세요.';
  end if;

  create temp table _pos_scope_sync_stores (store_code text primary key) on commit drop;

  if to_regclass('public.erp_stores') is not null then
    insert into _pos_scope_sync_stores (store_code)
    select distinct trim(store_code)
    from public.erp_stores
    where coalesce(is_active, true) = true
      and trim(coalesce(store_code, '')) <> ''
    on conflict (store_code) do nothing;
  end if;

  if to_regclass('public.pos_printer_settings') is not null then
    insert into _pos_scope_sync_stores (store_code)
    select distinct trim(store_code)
    from public.pos_printer_settings
    where trim(coalesce(store_code, '')) <> ''
    on conflict (store_code) do nothing;
  end if;

  if to_regclass('public.employees') is not null then
    insert into _pos_scope_sync_stores (store_code)
    select distinct trim(store) as store_code
    from public.employees
    where trim(coalesce(store, '')) <> ''
    on conflict (store_code) do nothing;
  end if;

  insert into _pos_scope_sync_stores (store_code)
  select distinct trim(store_code)
  from public.pos_menu_store_scopes
  where trim(coalesce(store_code, '')) <> ''
  on conflict (store_code) do nothing;

  if to_regclass('public.pos_menu_screen_configs') is not null then
    insert into _pos_scope_sync_stores (store_code)
    select distinct
      case
        when position('::' in trim(store_code)) > 0
          then split_part(trim(store_code), '::', 1)
        else trim(store_code)
      end
    from public.pos_menu_screen_configs
    where trim(coalesce(store_code, '')) <> ''
      and trim(store_code) not like '__global__%'
    on conflict (store_code) do nothing;
  end if;

  select count(*) into store_count from _pos_scope_sync_stores;

  select count(*) into active_menu_count
  from public.pos_menus pm
  where pm.is_active is distinct from false;

  select
    count(*) filter (where scoped_store_count = 0),
    count(*) filter (where scoped_store_count > 0)
  into without_scope, with_scope
  from (
    select
      pm.id,
      count(pms.store_code) filter (where pms.enabled is distinct from false) as scoped_store_count
    from public.pos_menus pm
    left join public.pos_menu_store_scopes pms on pms.menu_id = pm.id
    where pm.is_active is distinct from false
    group by pm.id
  ) s;

  raise notice '§1 사전 점검: store_count=%, active_menu_count=%, active_menus_without_scope=%, active_menus_with_scope=%',
    store_count, active_menu_count, without_scope, with_scope;
end $$;

-- ═══════════════════════════════════════════════════════════════
-- 2) 동기화 미리보기 — 변경 요약 + 샘플
--     ※ §1 바로 다음에 이 블록 실행 (같은 세션 temp table 사용 불가 → 독립 실행)
-- ═══════════════════════════════════════════════════════════════
do $$
declare
  store_count bigint;
  target_row_count bigint;
  current_row_count bigint;
  rows_to_insert bigint;
  rows_to_delete bigint;
begin
  if to_regclass('public.pos_menus') is null or to_regclass('public.pos_menu_store_scopes') is null then
    raise exception 'pos_menus / pos_menu_store_scopes 필요';
  end if;

  create temp table _pos_scope_sync_stores (store_code text primary key) on commit drop;
  create temp table _pos_scope_sync_target (menu_id bigint, store_code text, primary key (menu_id, store_code)) on commit drop;
  create temp table _pos_scope_sync_current (menu_id bigint, store_key text, primary key (menu_id, store_key)) on commit drop;

  if to_regclass('public.erp_stores') is not null then
    insert into _pos_scope_sync_stores (store_code)
    select distinct trim(store_code) from public.erp_stores
    where coalesce(is_active, true) = true and trim(coalesce(store_code, '')) <> ''
    on conflict do nothing;
  end if;
  if to_regclass('public.pos_printer_settings') is not null then
    insert into _pos_scope_sync_stores (store_code)
    select distinct trim(store_code) from public.pos_printer_settings
    where trim(coalesce(store_code, '')) <> ''
    on conflict do nothing;
  end if;
  if to_regclass('public.employees') is not null then
    insert into _pos_scope_sync_stores (store_code)
    select distinct trim(store) from public.employees
    where trim(coalesce(store, '')) <> ''
    on conflict do nothing;
  end if;
  insert into _pos_scope_sync_stores (store_code)
  select distinct trim(store_code) from public.pos_menu_store_scopes
  where trim(coalesce(store_code, '')) <> ''
  on conflict do nothing;
  if to_regclass('public.pos_menu_screen_configs') is not null then
    insert into _pos_scope_sync_stores (store_code)
    select distinct case when position('::' in trim(store_code)) > 0 then split_part(trim(store_code), '::', 1) else trim(store_code) end
    from public.pos_menu_screen_configs
    where trim(coalesce(store_code, '')) <> '' and trim(store_code) not like '__global__%'
    on conflict do nothing;
  end if;

  insert into _pos_scope_sync_target (menu_id, store_code)
  select distinct m.id, s.store_code
  from public.pos_menus m
  cross join _pos_scope_sync_stores s
  left join (
    select menu_id, count(*) as scoped_cnt
    from public.pos_menu_store_scopes
    where enabled is distinct from false
    group by menu_id
  ) msc on msc.menu_id = m.id
  where m.is_active is distinct from false
    and (
      exists (
        select 1 from public.pos_menu_store_scopes pms
        where pms.menu_id = m.id
          and pms.enabled is distinct from false
          and lower(trim(pms.store_code)) = lower(trim(s.store_code))
      )
      or (coalesce(msc.scoped_cnt, 0) = 0) /* compatibility_mode */
    );

  insert into _pos_scope_sync_current (menu_id, store_key)
  select pms.menu_id, lower(trim(pms.store_code))
  from public.pos_menu_store_scopes pms
  join public.pos_menus m on m.id = pms.menu_id
  where pms.enabled is distinct from false
    and m.is_active is distinct from false;

  select count(*) into store_count from _pos_scope_sync_stores;
  select count(*) into target_row_count from _pos_scope_sync_target;
  select count(*) into current_row_count from _pos_scope_sync_current;

  select count(*) into rows_to_insert
  from _pos_scope_sync_target t
  where not exists (
    select 1 from _pos_scope_sync_current c
    where c.menu_id = t.menu_id and c.store_key = lower(trim(t.store_code))
  );

  select count(*) into rows_to_delete
  from _pos_scope_sync_current c
  where not exists (
    select 1 from _pos_scope_sync_target t
    where t.menu_id = c.menu_id and lower(trim(t.store_code)) = c.store_key
  );

  raise notice '§2 미리보기: store_count=%, target_row_count=%, current_row_count=%, rows_to_insert=%, rows_to_delete=%',
    store_count, target_row_count, current_row_count, rows_to_insert, rows_to_delete;
end $$;

-- 샘플: 스코프 없던 활성 메뉴 (독립 SELECT — erp_stores 없어도 실행 가능)
select
  pm.id,
  pm.code,
  pm.name,
  coalesce(msc.scoped_cnt, 0) as current_scope_count
from public.pos_menus pm
left join (
  select menu_id, count(*) as scoped_cnt
  from public.pos_menu_store_scopes
  where enabled is distinct from false
  group by menu_id
) msc on msc.menu_id = pm.id
where pm.is_active is distinct from false
  and coalesce(msc.scoped_cnt, 0) = 0
order by pm.id
limit 30;

-- ═══════════════════════════════════════════════════════════════
-- 3) (선택) 스코프 없는 활성 메뉴 목록
-- ═══════════════════════════════════════════════════════════════
select pm.id, pm.code, pm.name
from public.pos_menus pm
where pm.is_active is distinct from false
  and not exists (
    select 1
    from public.pos_menu_store_scopes pms
    where pms.menu_id = pm.id
      and pms.enabled is distinct from false
  )
order by pm.id
limit 50;

-- ═══════════════════════════════════════════════════════════════
-- 4) 동기화 실행 — 주석 해제 후 이 블록만 실행
-- ═══════════════════════════════════════════════════════════════
-- begin;
--
-- do $$
-- declare
--   ins_count bigint;
--   del_count bigint;
-- begin
--   if to_regclass('public.pos_menus') is null or to_regclass('public.pos_menu_store_scopes') is null then
--     raise exception 'pos_menus / pos_menu_store_scopes 필요';
--   end if;
--
--   create temp table _pos_scope_sync_stores (store_code text primary key) on commit drop;
--   create temp table _pos_scope_sync_target (menu_id bigint, store_code text, primary key (menu_id, store_code)) on commit drop;
--
--   if to_regclass('public.erp_stores') is not null then
--     insert into _pos_scope_sync_stores (store_code)
--     select distinct trim(store_code) from public.erp_stores
--     where coalesce(is_active, true) = true and trim(coalesce(store_code, '')) <> ''
--     on conflict do nothing;
--   end if;
--   if to_regclass('public.pos_printer_settings') is not null then
--     insert into _pos_scope_sync_stores (store_code)
--     select distinct trim(store_code) from public.pos_printer_settings
--     where trim(coalesce(store_code, '')) <> ''
--     on conflict do nothing;
--   end if;
--   if to_regclass('public.employees') is not null then
--     insert into _pos_scope_sync_stores (store_code)
--     select distinct trim(store) from public.employees
--     where trim(coalesce(store, '')) <> ''
--     on conflict do nothing;
--   end if;
--   insert into _pos_scope_sync_stores (store_code)
--   select distinct trim(store_code) from public.pos_menu_store_scopes
--   where trim(coalesce(store_code, '')) <> ''
--   on conflict do nothing;
--   if to_regclass('public.pos_menu_screen_configs') is not null then
--     insert into _pos_scope_sync_stores (store_code)
--     select distinct case when position('::' in trim(store_code)) > 0 then split_part(trim(store_code), '::', 1) else trim(store_code) end
--     from public.pos_menu_screen_configs
--     where trim(coalesce(store_code, '')) <> '' and trim(store_code) not like '__global__%'
--     on conflict do nothing;
--   end if;
--
--   insert into _pos_scope_sync_target (menu_id, store_code)
--   select distinct m.id, s.store_code
--   from public.pos_menus m
--   cross join _pos_scope_sync_stores s
--   left join (
--     select menu_id, count(*) as scoped_cnt
--     from public.pos_menu_store_scopes
--     where enabled is distinct from false
--     group by menu_id
--   ) msc on msc.menu_id = m.id
--   where m.is_active is distinct from false
--     and (
--       exists (
--         select 1 from public.pos_menu_store_scopes pms
--         where pms.menu_id = m.id
--           and pms.enabled is distinct from false
--           and lower(trim(pms.store_code)) = lower(trim(s.store_code))
--       )
--       or (coalesce(msc.scoped_cnt, 0) = 0)
--     );
--
--   delete from public.pos_menu_store_scopes pms
--   using public.pos_menus m
--   where pms.menu_id = m.id
--     and m.is_active is distinct from false
--     and not exists (
--       select 1 from _pos_scope_sync_target t
--       where t.menu_id = pms.menu_id
--         and lower(trim(t.store_code)) = lower(trim(pms.store_code))
--     );
--   get diagnostics del_count = row_count;
--
--   insert into public.pos_menu_store_scopes (menu_id, store_code, enabled)
--   select tr.menu_id, tr.store_code, true
--   from _pos_scope_sync_target tr
--   on conflict (store_code, menu_id) do update
--   set enabled = true,
--       updated_at = now();
--   get diagnostics ins_count = row_count;
--
--   raise notice '§4 동기화 완료: deleted=%, upserted=%', del_count, ins_count;
-- end $$;
--
-- commit;

-- ═══════════════════════════════════════════════════════════════
-- 5) 사후 검증
-- ═══════════════════════════════════════════════════════════════
-- select pm.id, pm.code, pm.name
-- from public.pos_menus pm
-- where pm.is_active is distinct from false
--   and not exists (
--     select 1
--     from public.pos_menu_store_scopes pms
--     where pms.menu_id = pm.id
--       and pms.enabled is distinct from false
--   )
-- order by pm.id;
