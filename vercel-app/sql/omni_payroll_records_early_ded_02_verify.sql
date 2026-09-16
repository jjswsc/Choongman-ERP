-- Omni: early_min / early_ded 컬럼 확인 (01 실행 후)
-- 적용: Omni Supabase SQL Editor → 이 파일만 복사 → Run
-- 기대: early_ded, early_min 2행. data_type=numeric

SELECT column_name, data_type, column_default, is_nullable
FROM information_schema.columns
WHERE table_schema = 'public'
  AND table_name = 'payroll_records'
  AND column_name IN ('early_min', 'early_ded')
ORDER BY column_name;
