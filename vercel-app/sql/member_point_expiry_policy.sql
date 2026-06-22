-- 포인트 2년 롤링 소멸 (앱 배치: /api/members/cron/expire-points)
-- 별도 RPC 없이 member_points_ledger 원장 + members.point_balance / tier_points 갱신
-- Supabase: 스키마 변경 없음 (kind='expire' 원장 사용)

comment on column public.members.tier_points is
  '등급 산정용 누적 포인트. 적립일 기준 2년 롤링(만료 배치 후 최근 2년 적립분 합계).';
