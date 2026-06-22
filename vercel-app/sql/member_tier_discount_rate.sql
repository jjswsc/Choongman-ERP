-- 등급별 할인율 (member_tiers.discount_rate) — POS·회원앱 연동
-- Supabase SQL Editor 1회 실행

alter table public.member_tiers
  add column if not exists discount_rate numeric(8,4) not null default 0;

comment on column public.member_tiers.discount_rate is '등급 할인율 (0.05 = 5%). POS 회원 연결 시 자동 적용.';

-- 기본값 0 (관리자 화면에서 등급별 설정)
update public.member_tiers
set discount_rate = coalesce(discount_rate, 0),
    updated_at = (now() at time zone 'Asia/Bangkok')
where discount_rate is null;
