-- 선택형 세트 지원: pos_promo_items에 그룹 선택 컬럼 추가 (멱등)
-- 예) 3개 후보 중 1개 선택: 같은 choice_group 값 + choice_pick_count = 1

alter table public.pos_promo_items
  add column if not exists choice_group text;

alter table public.pos_promo_items
  add column if not exists choice_pick_count integer;

comment on column public.pos_promo_items.choice_group is
  '선택형 세트 그룹 키. 같은 promo_id + 같은 choice_group 끼리 한 그룹으로 본다.';

comment on column public.pos_promo_items.choice_pick_count is
  '해당 그룹에서 선택해야 하는 개수(기본 1).';

