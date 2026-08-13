-- เอกมัย เตาวอบพิซซ่า 중복 등록 1건 삭제 (2026-08-13)
-- 대상: FA-1786614710693 (나중 등록). 남길 코드: FA-1786614546388
-- 감가상각이 있으면 중단. 통장 출금은 자동 취소되지 않음(연결만 해제).

-- 1) 미리보기
SELECT id, asset_code, name, store_name, status, acquisition_date, acquisition_cost
FROM public.fixed_assets
WHERE asset_code IN ('FA-1786614546388', 'FA-1786614710693')
ORDER BY id;

SELECT de.id, de.fixed_asset_id, de.year_month, de.amount
FROM public.depreciation_entries de
JOIN public.fixed_assets fa ON fa.id = de.fixed_asset_id
WHERE fa.asset_code IN ('FA-1786614546388', 'FA-1786614710693');

SELECT bt.id, bt.trans_date, bt.amount, bt.memo, bt.fixed_asset_id, fa.asset_code
FROM public.bank_transactions bt
JOIN public.fixed_assets fa ON fa.id = bt.fixed_asset_id
WHERE fa.asset_code IN ('FA-1786614546388', 'FA-1786614710693');

-- 2) 삭제 (미리보기 확인 후 실행)
-- 감가상각이 있으면 0건 삭제됨
WITH target AS (
  SELECT fa.id
  FROM public.fixed_assets fa
  WHERE fa.asset_code = 'FA-1786614710693'
    AND COALESCE(fa.status, '') <> 'disposed'
    AND NOT EXISTS (
      SELECT 1 FROM public.depreciation_entries de WHERE de.fixed_asset_id = fa.id
    )
)
UPDATE public.bank_transactions bt
SET fixed_asset_id = NULL
WHERE bt.fixed_asset_id IN (SELECT id FROM target);

WITH target AS (
  SELECT fa.id
  FROM public.fixed_assets fa
  WHERE fa.asset_code = 'FA-1786614710693'
    AND COALESCE(fa.status, '') <> 'disposed'
    AND NOT EXISTS (
      SELECT 1 FROM public.depreciation_entries de WHERE de.fixed_asset_id = fa.id
    )
)
DELETE FROM public.fixed_assets
WHERE id IN (SELECT id FROM target);

-- 3) 검증: 남은 1건만 보여야 함
SELECT id, asset_code, name, store_name, status, acquisition_cost
FROM public.fixed_assets
WHERE name ILIKE '%เตาวอบ%'
   OR name ILIKE '%pizza%'
   OR asset_code IN ('FA-1786614546388', 'FA-1786614710693')
ORDER BY id;
