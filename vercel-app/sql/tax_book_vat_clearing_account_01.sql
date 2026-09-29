-- 세무 부가세 요약 전표의 차대 대체 계정. 기존 분개는 바꾸지 않는다.
-- 영업 중 실행해도 된다.

INSERT INTO public.account_subjects (code, name, name_en, type, p_and_l_section, sort_order, statement_type, normal_side)
VALUES
  ('1395', '세무부가세대체', 'Tax VAT clearing', 'asset', NULL, 9, 'bs', 'debit')
ON CONFLICT (code) DO NOTHING;
