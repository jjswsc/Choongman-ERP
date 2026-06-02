-- 회원 등급: LINE OA 기준 포인트·누적금액 + 회원앱 혜택 문구
-- Supabase SQL Editor에서 실행

alter table public.member_tiers
  add column if not exists min_points integer not null default 0,
  add column if not exists sort_order integer not null default 0,
  add column if not exists benefits_ko text,
  add column if not exists benefits_en text,
  add column if not exists benefits_th text;

-- VIP → DIAMOND (LINE OA 명칭 통일)
update public.members set tier_code = 'DIAMOND' where tier_code = 'VIP';

insert into public.member_tiers (code, name, min_amount, min_points, point_rate, sort_order, benefits_ko, benefits_en, benefits_th)
values
  (
    'BRONZE',
    'Bronze',
    0,
    0,
    0.0100,
    1,
    '기본 회원 등급입니다.',
    'Basic membership level.',
    'สมาชิกระดับพื้นฐาน'
  ),
  (
    'SILVER',
    'Silver',
    3000,
    120,
    0.0125,
    2,
    null,
    null,
    null
  ),
  (
    'GOLD',
    'Gold',
    6000,
    240,
    0.0150,
    3,
    null,
    null,
    null
  ),
  (
    'DIAMOND',
    'Diamond',
    10000,
    400,
    0.0200,
    4,
    null,
    null,
    null
  )
on conflict (code) do update
set
  name = excluded.name,
  min_amount = excluded.min_amount,
  min_points = excluded.min_points,
  point_rate = excluded.point_rate,
  sort_order = excluded.sort_order,
  benefits_ko = coalesce(public.member_tiers.benefits_ko, excluded.benefits_ko),
  benefits_en = coalesce(public.member_tiers.benefits_en, excluded.benefits_en),
  benefits_th = coalesce(public.member_tiers.benefits_th, excluded.benefits_th),
  updated_at = (now() at time zone 'Asia/Bangkok');

delete from public.member_tiers where code = 'VIP';
