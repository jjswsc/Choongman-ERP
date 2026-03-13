-- POS 조리 색상 규칙 설정 컬럼 추가
alter table if exists pos_printer_settings
  add column if not exists cooking_fresh_max_min integer not null default 10,
  add column if not exists cooking_warning_max_min integer not null default 15,
  add column if not exists cooking_rule_mode text not null default 'elapsed',
  add column if not exists cooking_recipe_warning_diff_min integer not null default 0,
  add column if not exists cooking_recipe_urgent_diff_min integer not null default 5,
  add column if not exists cooking_delay_badge_enabled boolean not null default true,
  add column if not exists cooking_delay_sound_enabled boolean not null default false,
  add column if not exists cooking_delay_alert_over_min integer not null default 0;

-- 최소 제약 (운영 중 기존 데이터와 충돌 방지용 완화 조건)
do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'pos_printer_settings_cooking_mode_chk'
  ) then
    alter table pos_printer_settings
      add constraint pos_printer_settings_cooking_mode_chk
      check (cooking_rule_mode in ('elapsed', 'recipe_diff'));
  end if;
exception when undefined_table then
  null;
end $$;
