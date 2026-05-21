-- Snow Onion Chicken Dosirak — POS 미노출 점검·복구
-- 증상: Korean > Dosirak 에 5개만 보이고 Snow Onion 도시락 없음 (홀/배달/포장 공통)
-- 원인 후보:
--   1) is_active = false (코드 중복 정리 pos_menu_code_lock_and_dedupe.sql 후 __dup_ 행)
--   2) category_main/category 가 Korean·Dosirak 가 아님
--   3) pos_menu_store_scopes 에 해당 매장 없음 (스코프 있는 메뉴만 노출)
--   4) 행 자체 없음 / 다른 이름으로만 존재
--
-- 참고: 어제 배포한 POS 변경은 Grab 인쇄·주방옵션 등이며, 메뉴 목록 API는 DB 그대로 반환합니다.

-- ── 1) 진단: 이름·코드·분류·활성·매장 스코프 ──
select
  pm.id,
  pm.code,
  pm.name,
  pm.category_main,
  pm.category,
  pm.is_active,
  pm.sold_out_date,
  pm.price,
  pm.price_delivery,
  pm.sort_order,
  coalesce(
    (
      select array_agg(distinct pms.store_code order by pms.store_code)
      from pos_menu_store_scopes pms
      where pms.menu_id = pm.id
        and pms.enabled is distinct from false
    ),
    array[]::text[]
  ) as store_scopes
from pos_menus pm
where lower(trim(pm.name)) like '%snow%onion%'
   or lower(trim(pm.name)) like '%snow%onions%'
   or lower(trim(pm.code)) in ('k022', 'k004', 'menu070')
order by pm.is_active desc, pm.id;

-- Korean > Dosirak 전체 (POS 그리드와 비교)
select id, code, name, is_active, price, price_delivery, sort_order
from pos_menus
where lower(trim(coalesce(category_main, ''))) = 'korean'
  and lower(trim(coalesce(category, ''))) = 'dosirak'
order by sort_order asc, name asc;

-- 같은 code 중복·비활성 dup 행
select lower(trim(code)) as code_key,
       count(*) as row_count,
       array_agg(id order by id) as menu_ids,
       array_agg(name order by id) as names,
       array_agg(is_active order by id) as active_flags
from pos_menus
where lower(trim(coalesce(code, ''))) in ('k022', 'k004', 'menu070')
   or lower(trim(name)) like '%snow%onion%dosirak%'
group by lower(trim(code))
having count(*) >= 1
order by code_key;

-- ── 1b) 6개 Dosirak 비교: 스코프·프로모·품절 (POS 미노출 원인) ──
select
  pm.id,
  pm.code,
  pm.name,
  pm.promo_id,
  pm.sold_out_date,
  pm.sort_order,
  coalesce(
    (
      select array_agg(distinct pms.store_code order by pms.store_code)
      from pos_menu_store_scopes pms
      where pms.menu_id = pm.id
        and pms.enabled is distinct from false
    ),
    array[]::text[]
  ) as store_scopes
from pos_menus pm
where pm.id in (69, 67, 311, 68, 385, 386)
order by pm.id;

-- POS 에 5개만 보일 때 흔한 패턴:
--   • id 311 만 store_scopes = {} 이고 나머지는 매장 있음 → 스코프 복사(아래 2) 실행
--   • id 311 만 promo_id 가 있음 → 프로모 기간/채널에 가려짐 → promo_id 제거(아래 2) 또는 프로모 활성화

-- ── 2) 복구 — id 311 (K022 Snow Onion Chicken Dosirak), 기준 id 69 (K001) ──
begin;

-- Dakgalbi 와 동일 매장 스코프 부여
insert into pos_menu_store_scopes (menu_id, store_code, enabled)
select
  311::bigint as menu_id,
  s.store_code,
  true
from pos_menu_store_scopes s
where s.menu_id = 69
  and s.enabled is distinct from false
  and trim(coalesce(s.store_code, '')) <> ''
on conflict (store_code, menu_id)
do update set enabled = true;

-- 일반 단품인데 프로모 미러로 묶여 있으면 그리드에서 숨김 → 연결 해제
update pos_menus
set promo_id = null
where id = 311
  and promo_id is not null;

update pos_menus
set
  is_active = true,
  category_main = 'Korean',
  category = 'Dosirak',
  sold_out_date = null
where id = 311;

commit;

-- __dup_ 로 비활성화된 행이 정본인 경우: 코드 복구 후 활성화 (code 충돌 없을 때만)
/*
begin;
update pos_menus
set
  code = 'k022',
  is_active = true,
  category_main = 'Korean',
  category = 'Dosirak'
where id = /* DUP_ROW_ID */
  and position('__dup_' in coalesce(code, '')) > 0
  and not exists (
    select 1 from pos_menus x
    where lower(trim(x.code)) = 'k022'
      and x.id <> /* DUP_ROW_ID */
      and x.is_active is distinct from false
  );
commit;
*/

-- ── 3) 사후 검증 (활성 Korean Dosirak 6개 내외) ──
select id, code, name, is_active, price, price_delivery
from pos_menus
where lower(trim(coalesce(category_main, ''))) = 'korean'
  and lower(trim(coalesce(category, ''))) = 'dosirak'
  and is_active is distinct from false
order by sort_order asc, name asc;
