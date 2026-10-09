-- LINE 수신 불가 회원 중 "실제 매장 방문(주문 적립)" 이력이 있는 회원 수 (조회 전용)
-- 02 의 active_90d 는 LINE CRM 이관 시 넣은 adjust 원장까지 세므로 부풀려짐 → 여기서는 주문 연결 earn 만 센다.
with unreach as (
  select
    m.id,
    coalesce(nullif(trim(m.source), ''), '(없음)') as source,
    exists (
      select 1
      from public.member_identities i
      where i.member_id = m.id
        and i.provider = 'line'
        and coalesce(trim(i.provider_user_id), '') <> ''
    ) as ever_linked
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
visits as (
  select
    l.member_id,
    max(l.created_at) as last_earn_at
  from public.member_points_ledger l
  where l.kind = 'earn'
    and l.order_id is not null
  group by l.member_id
)
select
  u.source,
  case when u.ever_linked then '2_언팔로우·차단' else '3_LINE 미연결' end as reach_reason,
  count(*) as unreachable,
  count(*) filter (where v.last_earn_at >= (now() at time zone 'Asia/Bangkok') - interval '30 days') as visit_30d,
  count(*) filter (where v.last_earn_at >= (now() at time zone 'Asia/Bangkok') - interval '90 days') as visit_90d,
  count(*) filter (where v.member_id is not null) as visit_ever
from unreach u
left join visits v on v.member_id = u.id
group by 1, 2
order by unreachable desc;
