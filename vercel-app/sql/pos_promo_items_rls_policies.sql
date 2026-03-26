-- pos_promo_items RLS: anon/authenticated가 REST로 쓸 수 있게 허용
-- 증상: "new row violates row-level security policy for table pos_promo_items" (42501)
--
-- pos_promos 와 동일하게, Vercel API가 anon 키만 쓰는 경우 INSERT/UPDATE/DELETE 가 막힐 수 있습니다.
-- 해결 A(권장): SUPABASE_SERVICE_ROLE_KEY 설정 → 서버에서 RLS 우회
-- 해결 B: 아래 정책을 Supabase SQL Editor에서 실행
--
-- pos_promos 정책: sql/pos_promos_rls_policies.sql

alter table public.pos_promo_items enable row level security;

drop policy if exists "pos_promo_items_allow_all_anon" on public.pos_promo_items;
create policy "pos_promo_items_allow_all_anon"
  on public.pos_promo_items
  for all
  to anon
  using (true)
  with check (true);

drop policy if exists "pos_promo_items_allow_all_authenticated" on public.pos_promo_items;
create policy "pos_promo_items_allow_all_authenticated"
  on public.pos_promo_items
  for all
  to authenticated
  using (true)
  with check (true);
