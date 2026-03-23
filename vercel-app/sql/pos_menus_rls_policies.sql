-- pos_menus RLS: anon/authenticated가 REST로 쓸 수 있게 허용
-- 증상: "new row violates row-level security policy for table pos_menus" (42501)
--
-- 프로모션 저장 시 미러 메뉴(pos_menus INSERT/UPDATE)가 여기서 막히는 경우가 많습니다.
-- 원인·해결은 pos_promos_rls_policies.sql 과 동일 (anon 키 + RLS).
--
-- 해결 A(권장): Vercel에 SUPABASE_SERVICE_ROLE_KEY 설정
-- 해결 B: 아래 정책 실행 (이미 pos_menus에 다른 정책이 있으면 충돌 여부를 SQL Editor에서 확인)

alter table public.pos_menus enable row level security;

drop policy if exists "pos_menus_allow_all_anon" on public.pos_menus;
create policy "pos_menus_allow_all_anon"
  on public.pos_menus
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "pos_menus_allow_all_authenticated" on public.pos_menus;
create policy "pos_menus_allow_all_authenticated"
  on public.pos_menus
  for all
  to authenticated
  using (true)
  with check (true);
