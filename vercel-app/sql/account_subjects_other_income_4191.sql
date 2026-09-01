-- 기타수익(폐유·잡이익 등). 매장 매출(4110)과 분리.
-- Supabase SQL Editor에서 이것만 복사 → Run

INSERT INTO public.account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('4191', '기타수익', 'Other income', 'revenue', 'revenue', 85)
ON CONFLICT (code) DO NOTHING;

UPDATE public.account_subjects
SET
  name = '기타수익',
  name_en = 'Other income',
  type = 'revenue',
  p_and_l_section = 'revenue',
  sort_order = 85,
  statement_type = 'pl',
  normal_side = 'credit'
WHERE code = '4191';
