-- 포인트 소수 2자리 지원 (적립·잔액·사용)
-- 예: Bronze 1% × 259바트 = 2.59P (기존 integer는 2P로 절사됨)
-- Supabase SQL Editor에서 1회 실행

alter table public.members
  alter column point_balance type numeric(12,2) using round(coalesce(point_balance, 0)::numeric, 2),
  alter column tier_points type numeric(12,2) using round(coalesce(tier_points, 0)::numeric, 2);

alter table public.members
  alter column line_tier_points type numeric(12,2)
  using round(coalesce(line_tier_points, 0)::numeric, 2);

alter table public.member_points_ledger
  alter column points type numeric(12,2) using round(coalesce(points, 0)::numeric, 2);

alter table public.pos_orders
  alter column point_earned type numeric(12,2) using round(coalesce(point_earned, 0)::numeric, 2),
  alter column point_used type numeric(12,2) using round(coalesce(point_used, 0)::numeric, 2);

comment on column public.members.point_balance is '사용 가능 포인트 잔액 (소수 2자리, 1P=1바트 사용)';
comment on column public.members.tier_points is '등급 산정용 누적 포인트 (소수 2자리)';
comment on column public.member_points_ledger.points is '원장 포인트 변동 (소수 2자리)';
comment on column public.pos_orders.point_earned is '주문 적립 포인트 (소수 2자리)';
