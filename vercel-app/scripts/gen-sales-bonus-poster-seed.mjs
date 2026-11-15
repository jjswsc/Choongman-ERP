/**
 * 포스터 기준 store_sales_bonus_settings UPSERT SQL 생성
 * node scripts/gen-sales-bonus-poster-seed.mjs
 */
import fs from 'fs'
import path from 'path'

const bases = [
  { storeCode: 'CM The Street', baseTarget: 1_600_000 },
  { storeCode: 'CM Silom', baseTarget: 1_700_000 },
  { storeCode: 'CM Ekkamai', baseTarget: 1_200_000 },
  { storeCode: 'CM Future Park', baseTarget: 900_000 },
  { storeCode: 'CM Union Mall', baseTarget: 1_400_000 },
  { storeCode: 'CM K-Village', baseTarget: 1_300_000 },
  { storeCode: 'CM Huamak', baseTarget: 1_200_000 },
  { storeCode: 'CM Seacon Srinakarin', baseTarget: 1_000_000 },
  { storeCode: 'CM True Digital', baseTarget: 1_200_000 },
  { storeCode: 'CM MBK', baseTarget: 1_600_000 }, // 포스터 150만 → 160만
]

function tiers(base) {
  const out = [{ threshold: base, amount: 1000 }]
  for (let i = 1; i <= 20; i++) out.push({ threshold: base + i * 100_000, amount: 500 })
  return out
}

const rows = bases
  .map((b) => {
    const j = JSON.stringify(tiers(b.baseTarget)).replace(/'/g, "''")
    return `  ('${b.storeCode}', true, 100, 2, 1, '${j}'::jsonb, now())`
  })
  .join(',\n')

const sql = `-- 충만 치킨 매출 보너스 포스터 1차 세팅 (UPSERT)
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
${rows}
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
`

const out = path.resolve('sql/store_sales_bonus_settings_02_seed_choongman_poster.sql')
fs.writeFileSync(out, sql)
console.log('wrote', out)
