-- 5210(ค่าวัตถุดิบอาหาร) 사용 건수 확인. 5111(วัตถุดิบอาหาร)과 중복.
-- 조회만. 변경 없음.
SELECT
  s.code,
  s.id,
  s.name,
  s.name_en,
  s.name_th,
  s.is_system,
  s.p_and_l_section,
  (SELECT count(*) FROM public.expense_accruals e WHERE e.account_subject_id = s.id) AS accruals,
  (SELECT count(*) FROM public.payable_transactions p WHERE p.account_subject_id = s.id) AS payables,
  (SELECT count(*) FROM public.bank_transactions b WHERE b.account_subject_id = s.id) AS bank_tx,
  (SELECT count(*) FROM public.journal_lines j WHERE j.account_subject_id = s.id OR j.account_code = s.code) AS journal_lines,
  (SELECT count(*) FROM public.items i WHERE i.account_subject_id = s.id) AS items
FROM public.account_subjects s
WHERE s.code IN ('5111', '5210')
ORDER BY s.code;
