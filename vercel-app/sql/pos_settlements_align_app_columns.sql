-- ============================================================
-- pos_settlements: 앱(savePosSettlement)과 컬럼 정렬
-- 증상: PGRST204 — Could not find the 'cash_amt' column of 'pos_settlements' in the schema cache
-- 조치: Supabase 대시보드 → SQL Editor → 전체 실행 → POS에서「ลองอีกครั้ง」또는 동기화 재시도
-- (CREATE만 예전 스크립트로 돌린 DB에서 빠진 컬럼을 한 번에 추가)
-- ============================================================

alter table public.pos_settlements
  add column if not exists cash_amt numeric(12, 2) default 0;

alter table public.pos_settlements
  add column if not exists card_breakdown jsonb default '{}'::jsonb;

alter table public.pos_settlements
  add column if not exists delivery_app_breakdown jsonb default '{}'::jsonb;

alter table public.pos_settlements
  add column if not exists qr_breakdown jsonb default '{}'::jsonb;

alter table public.pos_settlements
  add column if not exists dine_in_delivery_amt numeric(12, 2) default 0;

alter table public.pos_settlements
  add column if not exists dine_in_delivery_breakdown jsonb default '{}'::jsonb;

alter table public.pos_settlements
  add column if not exists other_breakdown jsonb default '{}'::jsonb;

update public.pos_settlements set cash_amt = 0 where cash_amt is null;
update public.pos_settlements set card_breakdown = '{}'::jsonb where card_breakdown is null;
update public.pos_settlements set delivery_app_breakdown = '{}'::jsonb where delivery_app_breakdown is null;
update public.pos_settlements set qr_breakdown = '{}'::jsonb where qr_breakdown is null;
update public.pos_settlements set dine_in_delivery_amt = 0 where dine_in_delivery_amt is null;
update public.pos_settlements set dine_in_delivery_breakdown = '{}'::jsonb where dine_in_delivery_breakdown is null;
update public.pos_settlements set other_breakdown = '{}'::jsonb where other_breakdown is null;

alter table public.pos_settlements
  add column if not exists cash_actual_denoms jsonb default null;

-- 스키마 캐시: 보통 수초~수분 내 반영. 계속 오류면 Supabase 프로젝트에서 API 재시작 또는 잠시 대기.
