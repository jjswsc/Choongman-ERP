-- 치킨 옵션: 추론 제거용 데이터 고정 (2026-06-07)
--  (A) 일반 치킨 M 옵션의 option_step_values.part 채우기 → 그랩 손님 화면 그룹 "part"로 통일
--  (B) option_code 누락분 백필 → 그랩 round-trip(코드 기반) 정밀도 향상
--
-- ✅ 원칙: DELETE 없음. 비어 있는 값만 채움(기존 값 보존). 여러 번 돌려도 안전(idempotent).
-- ⚠️ Bar.B.Q(C020~C023)는 건드리지 않는다. BBQ M-Boneless는 2단계 picker가 '이름'으로 처리하므로
--    part step을 넣으면 오히려 목록에서 제외되어 깨진다.

-- ─────────────────────────────────────────────────────────────
-- 0) 적용 전 — 현황 확인 (step 값 비어있는 것 / option_code 없는 것)
-- ─────────────────────────────────────────────────────────────
select m.code,
       m.name as menu_name,
       o.name as option_name,
       o.option_step_values,
       o.option_code,
       (o.option_code is null or trim(coalesce(o.option_code,'')) = '') as code_missing
from public.pos_menus m
join public.pos_menu_options o on o.menu_id = m.id
where m.code like 'C%'
  and coalesce(o.option_type,'substitution') = 'substitution'
order by m.code, o.sort_order nulls last, o.name;

-- ─────────────────────────────────────────────────────────────
-- (A) 일반 치킨 M 옵션 part 채우기 (BBQ 제외, 비어있을 때만)
--     C003 CHEESE / C004 RED HOT / C006 CURRYCANE /
--     C010 SOY / C011 GOLDEN / C012 SWEET / C013 SPICY
-- ─────────────────────────────────────────────────────────────
update public.pos_menu_options o
set option_step_values = case
  when trim(coalesce(o.name,'')) ~* '(boneless|순살)'         then '{"part":"Boneless"}'::jsonb
  when trim(coalesce(o.name,'')) ~* '(drumette|봉)'           then '{"part":"Drumette"}'::jsonb
  when trim(coalesce(o.name,'')) ~* '(joint\s*wing|wing|윙)'  then '{"part":"Wing"}'::jsonb
  else o.option_step_values
end
from public.pos_menus m
where o.menu_id = m.id
  and m.code in ('C003','C004','C006','C010','C011','C012','C013')
  and coalesce(o.option_type,'substitution') = 'substitution'
  and trim(coalesce(o.name,'')) ~* '^\s*m\s*[-–—]'     -- 'M - ...' 옵션만
  and (
    o.option_step_values is null
    or o.option_step_values = 'null'::jsonb
    or trim(coalesce(o.option_step_values::text,'')) in ('', '{}')
  );

-- ─────────────────────────────────────────────────────────────
-- (B) option_code 백필 — 코드가 없는 치킨 옵션만.
--     형식: <메뉴코드>-<번호>. 메뉴별 기존 최대 번호 다음부터 부여(충돌 방지).
-- ─────────────────────────────────────────────────────────────
with to_code as (
  select o.id,
         m.code as mcode,
         coalesce(mx.maxn, 0)
           + row_number() over (
               partition by o.menu_id
               order by o.sort_order nulls last, o.id
             ) as newn
  from public.pos_menu_options o
  join public.pos_menus m on m.id = o.menu_id
  left join lateral (
    select max( (regexp_replace(o2.option_code, '^.*-', ''))::int ) as maxn
    from public.pos_menu_options o2
    where o2.menu_id = o.menu_id
      and o2.option_code ~ '-\d+$'
  ) mx on true
  where m.code like 'C%'
    and (o.option_code is null or trim(coalesce(o.option_code,'')) = '')
)
update public.pos_menu_options o
set option_code = t.mcode || '-' || t.newn
from to_code t
where o.id = t.id;

-- ─────────────────────────────────────────────────────────────
-- 3) 적용 후 — 재확인 (이제 code_missing 가 모두 false, M 옵션 part 채워짐)
-- ─────────────────────────────────────────────────────────────
select m.code,
       m.name as menu_name,
       o.name as option_name,
       o.option_step_values,
       o.option_code,
       (o.option_code is null or trim(coalesce(o.option_code,'')) = '') as code_missing
from public.pos_menus m
join public.pos_menu_options o on o.menu_id = m.id
where m.code like 'C%'
  and coalesce(o.option_type,'substitution') = 'substitution'
order by m.code, o.sort_order nulls last, o.name;
