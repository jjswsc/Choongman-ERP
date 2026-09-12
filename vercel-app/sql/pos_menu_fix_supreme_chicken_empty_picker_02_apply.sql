-- Supreme Chicken (C002) — Size S/부위 숨김 옵션 제거 (사이드 김치·단무지는 유지)
-- ⚠️ C005 등 다른 메뉴 코드는 절대 포함하지 않음
-- 01_preview 확인 후에만 실행

begin;

update public.pos_menus m
set
  option_selection_groups = coalesce(
    (
      select jsonb_agg(to_jsonb(trim(elem)))
      from jsonb_array_elements_text(coalesce(m.option_selection_groups, '[]'::jsonb)) as elem
      where lower(trim(elem)) not in ('size', 'part')
    ),
    '[]'::jsonb
  ),
  option_selection_config = coalesce(
    (
      select jsonb_agg(cfg)
      from jsonb_array_elements(coalesce(m.option_selection_config, '[]'::jsonb)) as cfg
      where lower(trim(coalesce(cfg->>'key', ''))) not in ('size', 'part')
    ),
    '[]'::jsonb
  )
where lower(trim(coalesce(m.code, ''))) = 'c002'
   or lower(trim(coalesce(m.name, ''))) = 'supreme chicken';

delete from public.pos_menu_options o
using public.pos_menus m
where o.menu_id = m.id
  and (
    lower(trim(coalesce(m.code, ''))) = 'c002'
    or lower(trim(coalesce(m.name, ''))) = 'supreme chicken'
  )
  and coalesce(o.option_type, 'substitution') = 'substitution'
  and (
    trim(coalesce(o.name, '')) ~* '^\s*(size\s*)?[sml]\s*[-–—]'
    or trim(coalesce(o.name, '')) ~* '^\s*(size\s*)?[sml]\s*$'
    or trim(coalesce(o.name, '')) ~* '^(s\s*[-–—]?\s*)?(순살|boneless)\s*$'
    or trim(coalesce(o.name, '')) ~* '^m\s*[-–—]\s*(boneless|wing|drumette)'
    or (o.option_step_values ? 'size')
    or (o.option_step_values ? 'part')
  )
  and trim(coalesce(o.name, '')) !~* '(kimchi|pickled|radish|단무|김치|ไช)';

commit;
