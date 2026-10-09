-- LINE 수신 불가 회원 중 "전환 가능성 높은" 대상 — 가입 매장별 (조회 전용)
-- has_points      : 사용 가능 포인트가 남아 있음 → "포인트 지키려면 LINE 연결" 메시지가 먹히는 층
-- active_90d      : 최근 90일(방콕) 포인트 적립/사용 이력 → 매장에서 직접 만날 수 있는 층
-- has_phone       : 전화번호 있음 → 포털 전화+생일 연결로 기존 기록 병합 가능
with unreach as (
  select
    m.id,
    coalesce(nullif(trim(m.join_store_code), ''), '(없음)') as join_store_code,
    m.phone,
    coalesce(m.point_balance, 0) as point_balance
  from public.members m
  where coalesce(m.status, 'active') = 'active'
    and not exists (
      select 1
      from public.member_identities i
      where i.member_id = m.id
        and i.provider = 'line'
        and lower(coalesce(i.status, 'active')) = 'active'
        and coalesce(trim(i.provider_user_id), '') <> ''
    )
),
recent as (
  select distinct l.member_id
  from public.member_points_ledger l
  where l.created_at >= (now() at time zone 'Asia/Bangkok') - interval '90 days'
)
select
  u.join_store_code,
  count(*) as unreachable,
  count(*) filter (where u.point_balance > 0) as has_points,
  count(*) filter (where r.member_id is not null) as active_90d,
  count(*) filter (
    where nullif(regexp_replace(coalesce(u.phone, ''), '[^0-9]', '', 'g'), '') is not null
  ) as has_phone
from unreach u
left join recent r on r.member_id = u.id
group by rollup (u.join_store_code)
order by (u.join_store_code is null) desc, unreachable desc;
