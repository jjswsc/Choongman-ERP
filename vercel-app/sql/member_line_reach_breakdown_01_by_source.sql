-- 회원 LINE 수신 불가 원인 분해 (조회 전용, 활성 회원 기준)
-- 1_수신가능      : LINE 연결 + 친구 상태
-- 2_언팔로우·차단 : LINE 연결은 있었으나 unfollow 로 inactive
-- 3_LINE 미연결   : LINE userId 자체가 없음 (LINE CRM 엑셀 이관·전화+생일 가입 등)
with m as (
  select
    m.id,
    coalesce(nullif(trim(m.source), ''), '(없음)') as source,
    coalesce(nullif(trim(m.join_channel), ''), '(없음)') as join_channel,
    exists (
      select 1
      from public.member_identities i
      where i.member_id = m.id
        and i.provider = 'line'
        and lower(coalesce(i.status, 'active')) = 'active'
        and coalesce(trim(i.provider_user_id), '') <> ''
    ) as reachable,
    exists (
      select 1
      from public.member_identities i
      where i.member_id = m.id
        and i.provider = 'line'
        and coalesce(trim(i.provider_user_id), '') <> ''
    ) as ever_linked
  from public.members m
  where coalesce(m.status, 'active') = 'active'
)
select
  source,
  join_channel,
  case
    when reachable then '1_수신가능'
    when ever_linked then '2_언팔로우·차단'
    else '3_LINE 미연결'
  end as reach_reason,
  count(*) as members
from m
group by 1, 2, 3
order by members desc;
