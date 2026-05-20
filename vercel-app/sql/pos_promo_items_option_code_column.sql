-- 선택적: pos_promo_items.option_code 컬럼 추가 (없는 환경에서만 실행)
-- API/Grab 매핑 강화용. 컬럼이 이미 있으면 no-op.

alter table public.pos_promo_items
  add column if not exists option_code text;

comment on column public.pos_promo_items.option_code is
  'POS option_code snapshot for promo composition (Grab/order mapping).';
