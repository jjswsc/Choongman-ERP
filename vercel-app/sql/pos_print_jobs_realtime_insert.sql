-- 주방 큐 INSERT 를 Realtime에 올려 QR 주문이 홀 화면보다 먼저 인쇄되게 함.
-- pos_print_jobs 테이블이 있는 프로젝트에서 1회. 이미 publication에 있으면 무시.

do $$
begin
  alter publication supabase_realtime add table public.pos_print_jobs;
exception
  when duplicate_object then null;
end $$;

grant select on table public.pos_print_jobs to anon, authenticated;
