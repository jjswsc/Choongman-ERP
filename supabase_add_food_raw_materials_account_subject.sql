-- 패티캐시 식품 원재료 구매용 계정과목 추가
-- (Supabase SQL Editor에서 실행)
INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('5210', '식품 원재료', 'Food Raw Materials', 'expense', 'cost', 95)
ON CONFLICT (code) DO NOTHING;
