-- 옵션 단계 잔여 설정 자동 정리
-- 대상:
-- - 활성 메뉴
-- - option_selection_groups는 존재
-- - substitution 옵션은 0건
-- => POS에서 "옵션 선택" 모달만 뜨고 선택값 없는 증상 유발 가능

-- [사전 조회] 정리 대상
select
  m.id,
  m.code,
  m.name,
  m.is_active,
  coalesce(
    (
      select count(*)
      from pos_menu_options o
      where o.menu_id = m.id
        and coalesce(o.option_type, 'substitution') = 'substitution'
    ),
    0
  ) as substitution_option_count,
  m.option_selection_groups,
  m.option_selection_config
from pos_menus m
where coalesce(m.is_active, true) = true
  and coalesce(jsonb_array_length(
        case
          when m.option_selection_groups is null then '[]'::jsonb
          when jsonb_typeof(m.option_selection_groups::jsonb) = 'array' then m.option_selection_groups::jsonb
          else '[]'::jsonb
        end
      ), 0) > 0
  and not exists (
    select 1
    from pos_menu_options o
    where o.menu_id = m.id
      and coalesce(o.option_type, 'substitution') = 'substitution'
  )
order by m.code, m.id;

begin;

update pos_menus m
set option_selection_groups = '[]'::jsonb,
    option_selection_config = '[]'::jsonb
where coalesce(m.is_active, true) = true
  and coalesce(jsonb_array_length(
        case
          when m.option_selection_groups is null then '[]'::jsonb
          when jsonb_typeof(m.option_selection_groups::jsonb) = 'array' then m.option_selection_groups::jsonb
          else '[]'::jsonb
        end
      ), 0) > 0
  and not exists (
    select 1
    from pos_menu_options o
    where o.menu_id = m.id
      and coalesce(o.option_type, 'substitution') = 'substitution'
  );

commit;

-- [사후 검증] 0건 권장
select
  m.id,
  m.code,
  m.name
from pos_menus m
where coalesce(m.is_active, true) = true
  and coalesce(jsonb_array_length(
        case
          when m.option_selection_groups is null then '[]'::jsonb
          when jsonb_typeof(m.option_selection_groups::jsonb) = 'array' then m.option_selection_groups::jsonb
          else '[]'::jsonb
        end
      ), 0) > 0
  and not exists (
    select 1
    from pos_menu_options o
    where o.menu_id = m.id
      and coalesce(o.option_type, 'substitution') = 'substitution'
  )
order by m.code, m.id;
