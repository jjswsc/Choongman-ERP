-- ============================================================
-- Excel Income Statement 연동용 계정과목 추가
-- (supabase_add_account_subjects 실행 후 별도 적용용)
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('5461', '차량유지비', 'Vehicles', 'expense', 'expense', 120),
  ('5521', '용역비', 'Service costs', 'expense', 'expense', 144),
  ('5522', '연구개발비', 'R&D', 'expense', 'expense', 145),
  ('5523', '수리비', 'Repair fee', 'expense', 'expense', 146)
ON CONFLICT (code) DO NOTHING;
