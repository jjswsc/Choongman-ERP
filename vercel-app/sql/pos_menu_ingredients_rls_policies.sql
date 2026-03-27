-- pos_menu_ingredients RLS: BOM 저장(savePosMenuIngredient)·삭제·조회
--
-- 증상: "new row violates row-level security policy for table \"pos_menu_ingredients\"" (42501)
-- 원인: SELECT만 허용된 정책(pos_menu_ingredients_rls_select.sql)만 있고 INSERT/UPDATE/DELETE 없음
--
-- ═══ 권장 ═══
-- Vercel에 SUPABASE_SERVICE_ROLE_KEY 설정 시 서버 API는 RLS 우회 가능.
-- anon 키만 쓰는 배포에서는 아래를 Supabase SQL Editor에서 실행해야 저장이 됩니다.
--
-- Supabase SQL Editor에서 전체 실행.

alter table public.pos_menu_ingredients enable row level security;

-- 구버전: SELECT 전용 정책
drop policy if exists "Allow select pos_menu_ingredients" on public.pos_menu_ingredients;
drop policy if exists "pos_menu_ingredients_allow_public" on public.pos_menu_ingredients;

-- pos_menus와 동일 패턴: REST(anon/authenticated)에서 CRUD 허용
create policy "pos_menu_ingredients_allow_public"
  on public.pos_menu_ingredients
  as permissive
  for all
  to public
  using (true)
  with check (true);

grant usage on schema public to anon, authenticated;
grant select, insert, update, delete on table public.pos_menu_ingredients to anon, authenticated;

-- SERIAL/IDENTITY id 기본값(nextval) 사용 시: 테이블만 GRANT 해도 42501이 아닌 "permission denied for sequence"가 날 수 있음
do $$
declare
  seq regclass;
begin
  seq := pg_get_serial_sequence('public.pos_menu_ingredients', 'id')::regclass;
  if seq is not null then
    execute format('grant usage, select on sequence %s to anon, authenticated', seq::text);
  end if;
end$$;
