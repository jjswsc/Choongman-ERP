-- 지출·발주 등 자동 원천세 원장: บุคคลธรรมดา(태국어 개인명 / 주민번호 TIN)인데 form_hint가 PND53인 건 → PND3
-- draft만 수정 (제출된 건·법인 บจก./บริษัท 등은 제외)
-- ※ 법인 TIN(0으로 시작 13자리)은 태국어 상호여도 제외 — PND53 유지
-- 미리보기 후 UPDATE 실행 권장

-- 법인 약어·키워드 (제외용)
-- บจก. = บริษัทจำกัด, บมจ. = บริษัทมหาชนจำกัด, หจก. = ห้างหุ้นส่วนจำกัด

-- 1) 미리보기
SELECT
  id,
  payment_date,
  payee_name,
  payee_tax_id,
  form_hint,
  certificate_no,
  memo,
  filing_status
FROM public.withholding_tax_ledger_entries
WHERE COALESCE(filing_status, 'draft') <> 'submitted'
  AND UPPER(REPLACE(COALESCE(form_hint, ''), ' ', '')) LIKE '%53%'
  -- 법인명 제외
  AND payee_name !~* 'บริษัท|จำกัด|หจก|บจก|บมจ|มหาชน|สมาคม|มูลนิธิ|co\.?\s*,?\s*ltd|limited|company|corp|inc\.|plc'
  -- 법인 TIN(DBD, 0…) 제외
  AND NOT (
    length(regexp_replace(COALESCE(payee_tax_id, ''), '[^0-9]', '', 'g')) = 13
    AND substring(regexp_replace(COALESCE(payee_tax_id, ''), '[^0-9]', '', 'g') FROM 1 FOR 1) = '0'
  )
  AND (
    -- บัตรประชาชน: 13자리, 첫 자리 1~8
    (
      length(regexp_replace(COALESCE(payee_tax_id, ''), '[^0-9]', '', 'g')) = 13
      AND substring(regexp_replace(COALESCE(payee_tax_id, ''), '[^0-9]', '', 'g') FROM 1 FOR 1) ~ '^[1-8]$'
    )
    -- 태국어 이름 + 법인 키워드·법인 TIN 없음
    OR payee_name ~ '[\u0E00-\u0E7F]'
  )
ORDER BY id DESC
LIMIT 200;

-- 2) 수정 (미리보기 확인 후 주석 해제)
-- UPDATE public.withholding_tax_ledger_entries
-- SET
--   form_hint = 'PND3',
--   updated_at = now()
-- WHERE id IN (
--   SELECT id
--   FROM public.withholding_tax_ledger_entries
--   WHERE COALESCE(filing_status, 'draft') <> 'submitted'
--     AND UPPER(REPLACE(COALESCE(form_hint, ''), ' ', '')) LIKE '%53%'
--     AND payee_name !~* 'บริษัท|จำกัด|หจก|บจก|บมจ|มหาชน|สมาคม|มูลนิธิ|co\.?\s*,?\s*ltd|limited|company|corp|inc\.|plc'
--     AND NOT (
--       length(regexp_replace(COALESCE(payee_tax_id, ''), '[^0-9]', '', 'g')) = 13
--       AND substring(regexp_replace(COALESCE(payee_tax_id, ''), '[^0-9]', '', 'g') FROM 1 FOR 1) = '0'
--     )
--     AND (
--       (
--         length(regexp_replace(COALESCE(payee_tax_id, ''), '[^0-9]', '', 'g')) = 13
--         AND substring(regexp_replace(COALESCE(payee_tax_id, ''), '[^0-9]', '', 'g') FROM 1 FOR 1) ~ '^[1-8]$'
--       )
--       OR payee_name ~ '[\u0E00-\u0E7F]'
--     )
-- );

-- 3) 이번 건만 바로 고치기 (id 159 = รักษา วิจิตรโสภาพันธ์)
-- UPDATE public.withholding_tax_ledger_entries
-- SET form_hint = 'PND3', updated_at = now()
-- WHERE id = 159
--   AND COALESCE(filing_status, 'draft') <> 'submitted';
