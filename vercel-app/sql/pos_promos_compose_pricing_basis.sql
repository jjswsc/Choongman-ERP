-- 번들 세트 구성(마케팅/메뉴) Step 1에서 선택한 가격 기준 저장
-- Supabase SQL Editor에서 실행 (컬럼이 이미 있으면 스킵)

alter table public.pos_promos
  add column if not exists compose_pricing_basis text;

comment on column public.pos_promos.compose_pricing_basis is
  '세트 구성 시 메뉴 피커·가격분석 기준: hall(매장/포장) | delivery(배달). 없으면 hall로 간주.';
