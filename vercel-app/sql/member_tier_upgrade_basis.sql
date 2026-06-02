-- 등급 승급 기준 설정 + 포인트 기준용 tier_points
-- Supabase SQL Editor에서 실행

alter table public.members
  add column if not exists tier_points integer not null default 0;

insert into public.system_settings (key, value_json, updated_at)
values ('member_tier_upgrade_basis', '"points"'::jsonb, (now() at time zone 'Asia/Bangkok'))
on conflict (key) do nothing;

-- 원장 적립분으로 tier_points 백필 (기존 회원)
update public.members m
set tier_points = greatest(
  coalesce(m.tier_points, 0),
  coalesce(sub.sum_pts, 0),
  coalesce(m.line_tier_points, 0)
)
from (
  select
    member_id,
    coalesce(sum(case when points > 0 then points else 0 end), 0)::integer as sum_pts
  from public.member_points_ledger
  group by member_id
) sub
where m.id = sub.member_id;

-- LINE tier points만 있는 회원
update public.members
set tier_points = greatest(coalesce(tier_points, 0), coalesce(line_tier_points, 0))
where coalesce(line_tier_points, 0) > coalesce(tier_points, 0);
