-- 손익 구분 p_and_l_section 'fixed'(고정비) → 'expense'(판관비) 통일
-- 지출등록·통장 경비는 forExpense 필터에 포함되도록 DB 데이터 정리 (선택 실행)
-- TFRS for NPAEs 참고 시 판관비/경비 계열로 두는 것이 일반적

UPDATE public.account_subjects
SET p_and_l_section = 'expense'
WHERE lower(trim(coalesce(p_and_l_section, ''))) = 'fixed';
