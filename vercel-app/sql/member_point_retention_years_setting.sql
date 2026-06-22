-- 포인트 소멸 기간(년) — system_settings.member_point_retention_years
insert into public.system_settings (key, value_json, updated_at)
values ('member_point_retention_years', '2'::jsonb, (now() at time zone 'Asia/Bangkok'))
on conflict (key) do nothing;
