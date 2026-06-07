-- 전 매장 영업일 경계 08:00 통일 (방콕 Asia/Bangkok)
-- 08:00 시작 = 08:00 종료 → 24시간 롤링 영업일 [D 08:00, D+1 08:00)
-- 매장별 덮어쓰기는 비워 전사 기본만 적용합니다.

insert into public.system_settings (key, value_json, updated_at)
values (
  'pos_business_day_start',
  '{"start":{"hour":8,"minute":0},"end":{"hour":8,"minute":0}}'::jsonb,
  now()
)
on conflict (key) do update set
  value_json = excluded.value_json,
  updated_at = excluded.updated_at;

insert into public.system_settings (key, value_json, updated_at)
values (
  'pos_business_day_start_by_store',
  '{"v":1,"stores":{}}'::jsonb,
  now()
)
on conflict (key) do update set
  value_json = excluded.value_json,
  updated_at = excluded.updated_at;

