-- 돈통 시제 권종별 장 수 (JSON). Supabase SQL Editor에서 실행.
-- 키: "1000","500","100","50","20","10","5","2","1" → 정수 장수

alter table public.pos_settlements
  add column if not exists cash_actual_denoms jsonb default null;
