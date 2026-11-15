-- 충만 치킨 매출 보너스 포스터 1차 세팅 (UPSERT)
-- 적용: Supabase SQL Editor → 이 파일만 복사 → Run
-- 선행: store_sales_bonus_settings_01_table.sql
--
-- 규칙 반영:
--   · 목표 달성 → 인당 1,000฿
--   · 초과 10만당 +500฿ (누적, 초과 구간 20칸까지)
--   · 매니저 ×2 / 일반 ×1
--   · 결근 1일당 100% 차감(=무단 결근 시 해당 월 보너스 0에 가깝게)
--   · MBK 목표는 포스터 150만이 아니라 160만
--
-- 미자동화(수동):
--   · 인원 +1명 → 목표 +10만 (엑카마이 11명 시 125만 = +5만 예외)
--   · 「만근」별도 자격 조건은 추후

INSERT INTO public.store_sales_bonus_settings (
  store_code,
  enabled,
  absence_penalty_pct_per_day,
  manager_multiplier,
  staff_multiplier,
  tiers,
  updated_at
) VALUES
  ('CM The Street', true, 100, 2, 1, '[{"threshold":1600000,"amount":1000},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500},{"threshold":3100000,"amount":500},{"threshold":3200000,"amount":500},{"threshold":3300000,"amount":500},{"threshold":3400000,"amount":500},{"threshold":3500000,"amount":500},{"threshold":3600000,"amount":500}]'::jsonb, now()),
  ('CM Silom', true, 100, 2, 1, '[{"threshold":1700000,"amount":1000},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500},{"threshold":3100000,"amount":500},{"threshold":3200000,"amount":500},{"threshold":3300000,"amount":500},{"threshold":3400000,"amount":500},{"threshold":3500000,"amount":500},{"threshold":3600000,"amount":500},{"threshold":3700000,"amount":500}]'::jsonb, now()),
  ('CM Ekkamai', true, 100, 2, 1, '[{"threshold":1200000,"amount":1000},{"threshold":1300000,"amount":500},{"threshold":1400000,"amount":500},{"threshold":1500000,"amount":500},{"threshold":1600000,"amount":500},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500},{"threshold":3100000,"amount":500},{"threshold":3200000,"amount":500}]'::jsonb, now()),
  ('CM Future Park', true, 100, 2, 1, '[{"threshold":900000,"amount":1000},{"threshold":1000000,"amount":500},{"threshold":1100000,"amount":500},{"threshold":1200000,"amount":500},{"threshold":1300000,"amount":500},{"threshold":1400000,"amount":500},{"threshold":1500000,"amount":500},{"threshold":1600000,"amount":500},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500}]'::jsonb, now()),
  ('CM Union Mall', true, 100, 2, 1, '[{"threshold":1400000,"amount":1000},{"threshold":1500000,"amount":500},{"threshold":1600000,"amount":500},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500},{"threshold":3100000,"amount":500},{"threshold":3200000,"amount":500},{"threshold":3300000,"amount":500},{"threshold":3400000,"amount":500}]'::jsonb, now()),
  ('CM K-Village', true, 100, 2, 1, '[{"threshold":1300000,"amount":1000},{"threshold":1400000,"amount":500},{"threshold":1500000,"amount":500},{"threshold":1600000,"amount":500},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500},{"threshold":3100000,"amount":500},{"threshold":3200000,"amount":500},{"threshold":3300000,"amount":500}]'::jsonb, now()),
  ('CM Huamak', true, 100, 2, 1, '[{"threshold":1200000,"amount":1000},{"threshold":1300000,"amount":500},{"threshold":1400000,"amount":500},{"threshold":1500000,"amount":500},{"threshold":1600000,"amount":500},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500},{"threshold":3100000,"amount":500},{"threshold":3200000,"amount":500}]'::jsonb, now()),
  ('CM Seacon Srinakarin', true, 100, 2, 1, '[{"threshold":1000000,"amount":1000},{"threshold":1100000,"amount":500},{"threshold":1200000,"amount":500},{"threshold":1300000,"amount":500},{"threshold":1400000,"amount":500},{"threshold":1500000,"amount":500},{"threshold":1600000,"amount":500},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500}]'::jsonb, now()),
  ('CM True Digital', true, 100, 2, 1, '[{"threshold":1200000,"amount":1000},{"threshold":1300000,"amount":500},{"threshold":1400000,"amount":500},{"threshold":1500000,"amount":500},{"threshold":1600000,"amount":500},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500},{"threshold":3100000,"amount":500},{"threshold":3200000,"amount":500}]'::jsonb, now()),
  ('CM MBK', true, 100, 2, 1, '[{"threshold":1600000,"amount":1000},{"threshold":1700000,"amount":500},{"threshold":1800000,"amount":500},{"threshold":1900000,"amount":500},{"threshold":2000000,"amount":500},{"threshold":2100000,"amount":500},{"threshold":2200000,"amount":500},{"threshold":2300000,"amount":500},{"threshold":2400000,"amount":500},{"threshold":2500000,"amount":500},{"threshold":2600000,"amount":500},{"threshold":2700000,"amount":500},{"threshold":2800000,"amount":500},{"threshold":2900000,"amount":500},{"threshold":3000000,"amount":500},{"threshold":3100000,"amount":500},{"threshold":3200000,"amount":500},{"threshold":3300000,"amount":500},{"threshold":3400000,"amount":500},{"threshold":3500000,"amount":500},{"threshold":3600000,"amount":500}]'::jsonb, now())
ON CONFLICT (store_code) DO UPDATE SET
  enabled = EXCLUDED.enabled,
  absence_penalty_pct_per_day = EXCLUDED.absence_penalty_pct_per_day,
  manager_multiplier = EXCLUDED.manager_multiplier,
  staff_multiplier = EXCLUDED.staff_multiplier,
  tiers = EXCLUDED.tiers,
  updated_at = now();

DO $$ BEGIN
  IF to_regclass('public.sql_applied_log') IS NOT NULL THEN
    INSERT INTO public.sql_applied_log (file_name) VALUES ('store_sales_bonus_settings_02_seed_choongman_poster.sql')
    ON CONFLICT (file_name) DO UPDATE
      SET last_applied_at = now(), run_count = public.sql_applied_log.run_count + 1;
  END IF;
END $$;
