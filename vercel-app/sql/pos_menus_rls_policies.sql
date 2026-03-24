-- pos_menus RLS: REST(anon/authenticated)에서 INSERT·UPDATE·SELECT 허용
-- 증상: "new row violates row-level security policy for table pos_menus" (42501)
--
-- 프로모션 저장 시 미러 메뉴(pos_menus) upsert가 여기서 막히는 경우가 많습니다.
--
-- ═══ 해결 A (가장 권장) ═══
-- Vercel 프로젝트 → Settings → Environment Variables 에 다음 추가 후 재배포:
--   SUPABASE_SERVICE_ROLE_KEY = Supabase Dashboard → Project Settings → API → service_role (secret)
-- service_role JWT는 RLS를 우회합니다. 키는 절대 클라이언트/브라우저에 넣지 마세요.
--
-- ═══ 해결 B ═══
-- 아래 전체를 Supabase SQL Editor에서 한 번 실행 (이미 정책이 있으면 DROP 후 재생성됨)
--
-- ═══ 여전히 42501이면 ═══
-- 1) SQL이 **이 프로젝트**의 DB에 실행됐는지 확인
-- 2) Vercel의 SUPABASE_URL이 같은 프로젝트인지 확인
-- 3) service_role 값 앞뒤 공백·따옴표·줄바꿈 오타 제거 후 재배포

alter table public.pos_menus enable row level security;

-- 기존 이름(구버전 스크립트) 제거
drop policy if exists "pos_menus_allow_all_anon" on public.pos_menus;
drop policy if exists "pos_menus_allow_all_authenticated" on public.pos_menus;
drop policy if exists "pos_menus_allow_public" on public.pos_menus;

-- 모든 역할에 대해 허용 (anon / authenticated / 기타 JWT 역할까지 한 번에 커버)
create policy "pos_menus_allow_public"
  on public.pos_menus
  as permissive
  for all
  to public
  using (true)
  with check (true);

-- 테이블 권한(일부 프로젝트·복제 DB에서만 부족할 때)
grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_menus to anon, authenticated;
