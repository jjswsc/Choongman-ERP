-- POS option_code 자동 보정
-- 목적:
-- 1) option_code prefix와 menu code 불일치 자동 수정
-- 2) 같은 menu_id 내 option_code 중복(대소문자 무시) 자동 정리
-- 3) 빈 option_code 자동 채움
--
-- 규칙:
-- - 정상 코드 형식: {menu_code}-{숫자}
-- - 보정 대상은 menu_code가 있는 메뉴만 처리
-- - 보정 코드는 메뉴별 현재 최대 suffix 다음 번호부터 순차 부여

-- [사전 점검] 보정 대상 미리 보기
with analyzed as (
  select
    o.id,
    o.menu_id,
    trim(coalesce(m.code, '')) as menu_code,
    trim(coalesce(o.option_code, '')) as option_code,
    regexp_match(trim(coalesce(o.option_code, '')), '^(.*)-([0-9]+)$') as code_match
  from pos_menu_options o
  join pos_menus m on m.id = o.menu_id
),
normalized as (
  select
    a.*,
    coalesce((a.code_match)[1], '') as code_prefix,
    case
      when a.code_match is not null then ((a.code_match)[2])::int
      else null
    end as suffix_num,
    case
      when a.code_match is not null
       and lower(coalesce((a.code_match)[1], '')) = lower(a.menu_code) then true
      else false
    end as prefix_ok,
    row_number() over (
      partition by a.menu_id, lower(a.option_code)
      order by a.id
    ) as dup_rn
  from analyzed a
)
select
  id,
  menu_id,
  menu_code,
  option_code,
  prefix_ok,
  dup_rn
from normalized
where menu_code <> ''
  and (
    option_code = ''
    or prefix_ok = false
    or (option_code <> '' and dup_rn > 1)
  )
order by menu_id, id;

-- [자동 보정]
with analyzed as (
  select
    o.id,
    o.menu_id,
    trim(coalesce(m.code, '')) as menu_code,
    trim(coalesce(o.option_code, '')) as option_code,
    regexp_match(trim(coalesce(o.option_code, '')), '^(.*)-([0-9]+)$') as code_match
  from pos_menu_options o
  join pos_menus m on m.id = o.menu_id
),
normalized as (
  select
    a.*,
    coalesce((a.code_match)[1], '') as code_prefix,
    case
      when a.code_match is not null then ((a.code_match)[2])::int
      else null
    end as suffix_num,
    case
      when a.code_match is not null
       and lower(coalesce((a.code_match)[1], '')) = lower(a.menu_code) then true
      else false
    end as prefix_ok,
    row_number() over (
      partition by a.menu_id, lower(a.option_code)
      order by a.id
    ) as dup_rn
  from analyzed a
),
menu_max_suffix as (
  select
    menu_id,
    max(suffix_num) as max_suffix
  from normalized
  where menu_code <> ''
    and prefix_ok = true
    and suffix_num is not null
  group by menu_id
),
targets as (
  select
    n.id,
    n.menu_id,
    n.menu_code,
    row_number() over (partition by n.menu_id order by n.id) as seq
  from normalized n
  where n.menu_code <> ''
    and (
      n.option_code = ''
      or n.prefix_ok = false
      or (n.option_code <> '' and n.dup_rn > 1)
    )
),
new_codes as (
  select
    t.id,
    t.menu_id,
    t.menu_code || '-' || (coalesce(ms.max_suffix, 0) + t.seq)::text as next_option_code
  from targets t
  left join menu_max_suffix ms on ms.menu_id = t.menu_id
)
update pos_menu_options o
set option_code = nc.next_option_code
from new_codes nc
where o.id = nc.id;

-- [사후 검증 1] prefix 불일치 0건
select
  o.id as option_id,
  o.menu_id,
  m.code as menu_code,
  o.option_code
from pos_menu_options o
join pos_menus m on m.id = o.menu_id
where trim(coalesce(o.option_code, '')) <> ''
  and split_part(o.option_code, '-', 1) <> trim(coalesce(m.code, ''))
order by o.menu_id, o.id;

-- [사후 검증 2] menu_id 내 option_code 중복 0건
select
  o.menu_id,
  lower(trim(coalesce(o.option_code, ''))) as option_code_key,
  count(*) as row_count,
  array_agg(o.id order by o.id) as option_ids
from pos_menu_options o
where trim(coalesce(o.option_code, '')) <> ''
group by o.menu_id, lower(trim(coalesce(o.option_code, '')))
having count(*) > 1
order by o.menu_id, option_code_key;
