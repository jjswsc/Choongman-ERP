-- 본사 PP.30 매입: store_name이 「입고등록」등으로으로 남아 CM Office 조회에서 빠진 행 보정
-- Supabase SQL Editor에서 실행. tax_month는 대상월로 바꾸세요.

-- 1) 현황 확인
SELECT
  store_name,
  direction,
  count(*) AS row_cnt,
  round(sum(coalesce(vat_amount, 0))::numeric, 2) AS vat_sum
FROM public.vat_ledger_entries
WHERE tax_month = '2026-07'
  AND direction = 'input'
  AND store_name IN (
    '입고등록',
    '입고등록(본사)',
    '본사',
    'HQ',
    'Office',
    '오피스',
    '본점'
  )
GROUP BY store_name, direction
ORDER BY store_name;

-- 2) CM Office로 통일 (위 결과가 있으면 때)
UPDATE public.vat_ledger_entries
SET
  store_name = 'CM Office',
  updated_at = now()
WHERE tax_month = '2026-07'
  AND store_name IN (
    '입고등록',
    '입고등록(본사)',
    '본사',
    'HQ',
    'Office',
    '오피스',
    '본점'
  );

-- 3) 반영 확인
SELECT
  store_name,
  direction,
  count(*) AS row_cnt,
  round(sum(coalesce(vat_amount, 0))::numeric, 2) AS vat_sum
FROM public.vat_ledger_entries
WHERE tax_month = '2026-07'
  AND store_name = 'CM Office'
GROUP BY store_name, direction
ORDER BY direction;
