-- Realtime INSERT 가 RLS 때문에 막히면 주방 큐 이벤트가 POS에 안 감.
-- GRANT SELECT 만으로는 RLS ON 일 때 부족. SELECT 정책을 연다. 1회 실행.

drop policy if exists pos_print_jobs_select_realtime on public.pos_print_jobs;

create policy pos_print_jobs_select_realtime
  on public.pos_print_jobs
  for select
  to anon, authenticated
  using (true);
