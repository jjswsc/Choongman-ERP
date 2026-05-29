-- 지출관리: 배달앱 수수료 / 카드 수수료 계정과목 (없을 때만 삽입)
-- Supabase SQL Editor에서 실행

INSERT INTO public.account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('5528', '배달앱수수료', 'Delivery Fee', 'expense', 'expense', 137),
  ('5529', '카드수수료', 'Card Fee', 'expense', 'expense', 138)
ON CONFLICT (code) DO NOTHING;

-- 기존 DB에 코드만 있고 영문명이 다를 때 표시명 정리 (선택)
UPDATE public.account_subjects
SET
  name = '배달앱수수료',
  name_en = 'Delivery Fee',
  type = 'expense',
  p_and_l_section = 'expense',
  sort_order = 137
WHERE code = '5528'
  AND (name_en IS DISTINCT FROM 'Delivery Fee' OR p_and_l_section IS DISTINCT FROM 'expense');

UPDATE public.account_subjects
SET
  name = '카드수수료',
  name_en = 'Card Fee',
  type = 'expense',
  p_and_l_section = 'expense',
  sort_order = 138
WHERE code = '5529'
  AND (name_en IS DISTINCT FROM 'Card Fee' OR p_and_l_section IS DISTINCT FROM 'expense');
