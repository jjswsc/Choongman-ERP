-- Supreme Chicken (C002) 남은 빈 sidedish 단계 제거
-- 사이드 옵션·링크가 없는 상태이므로 단계만 남아 빈 모달이 다시 열릴 수 있음
-- 06_verify_links에서 group_key/item_name이 모두 null인 뒤에만 실행
-- ⚠️ C005 등 다른 메뉴 코드는 절대 포함하지 않음

begin;

update public.pos_menus
set
  option_selection_groups = '[]'::jsonb,
  option_selection_config = '[]'::jsonb
where lower(trim(coalesce(code, ''))) = 'c002'
   or lower(trim(coalesce(name, ''))) = 'supreme chicken';

commit;
