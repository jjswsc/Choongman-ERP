-- 채널 정산 수수료 계정 (없을 때만 삽입)
-- 5521/5522는 용역비·연구개발비 등과 코드 충돌 가능 → 5528/5529 사용 (account_subjects_delivery_card_fee.sql)

INSERT INTO public.account_subjects (code, name, name_en, type, p_and_l_section, sort_order)
SELECT v.code, v.name_ko, v.name_en, 'expense', 'expense', v.sort_order
FROM (VALUES
  ('5528', '배달앱수수료', 'Delivery Fee', 137),
  ('5529', '카드수수료', 'Card Fee', 138)
) AS v(code, name_ko, name_en, sort_order)
WHERE NOT EXISTS (
  SELECT 1 FROM public.account_subjects s WHERE s.code = v.code
);
