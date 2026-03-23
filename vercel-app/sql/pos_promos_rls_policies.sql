-- pos_promos RLS: anon/authenticated가 REST로 쓸 수 있게 허용
-- 증상: "new row violates row-level security policy for table pos_promos" (42501)
--
-- 원인: Vercel 등에 SUPABASE_SERVICE_ROLE_KEY가 없고 anon 키만 쓰는 경우 RLS가 적용됨.
-- 해결 A(권장): Vercel 환경 변수에 SUPABASE_SERVICE_ROLE_KEY 설정 → RLS 우회
-- 해결 B: 아래 정책을 Supabase SQL Editor에서 실행
--
-- 주의: anon 전체 허용은 "키가 서버에만 있다"는 전제에서 ERP용으로 흔함.
--       공개 클라이언트에서 anon 키를 노출하면 위험하므로 키는 서버 전용으로 두세요.

alter table public.pos_promos enable row level security;

drop policy if exists "pos_promos_allow_all_anon" on public.pos_promos;
create policy "pos_promos_allow_all_anon"
  on public.pos_promos
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "pos_promos_allow_all_authenticated" on public.pos_promos;
create policy "pos_promos_allow_all_authenticated"
  on public.pos_promos
  for all
  to authenticated
  using (true)
  with check (true);

-- service_role 은 RLS를 우회하므로 정책 불필요
--
-- pos_menus 에서 42501 이 나오면: sql/pos_menus_rls_policies.sql 실행
