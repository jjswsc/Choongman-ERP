-- 채널 정산 수수료 계정 (없을 때만 삽입)

INSERT INTO public.account_subjects (code, name, name_en, type, parent_id, sort_order, statement, normal_side, is_system)
SELECT v.code, v.name_ko, v.name_en, 'expense', NULL, v.sort_order, 'pl', 'debit', TRUE
FROM (VALUES
  ('5521', '카드정산수수료', 'Card settlement fees', 5521),
  ('5522', '배달플랫폼수수료', 'Delivery platform fees', 5522)
) AS v(code, name_ko, name_en, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.account_subjects s WHERE s.code = v.code
);
