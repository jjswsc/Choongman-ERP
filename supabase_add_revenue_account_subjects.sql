-- ============================================================
-- 수익(입금) 계정과목 추가
-- 배달앱, 카드, QR/이체, 현금입금
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

INSERT INTO account_subjects (code, name, name_en, type, p_and_l_section, sort_order) VALUES
  ('4110', '배달앱정산(기타)', 'Delivery Other', 'revenue', 'revenue', 50),
  ('4111', 'Grab', 'Grab', 'revenue', 'revenue', 51),
  ('4112', 'Line Man', 'Line Man', 'revenue', 'revenue', 52),
  ('4113', 'Shopee', 'Shopee', 'revenue', 'revenue', 53),
  ('4114', 'Food Panda', 'Food Panda', 'revenue', 'revenue', 54),
  ('4115', 'Robinhood', 'Robinhood', 'revenue', 'revenue', 55),
  ('4120', '카드매출(기타)', 'Card Other', 'revenue', 'revenue', 60),
  ('4121', 'Visa', 'Visa', 'revenue', 'revenue', 61),
  ('4122', 'Master', 'Master', 'revenue', 'revenue', 62),
  ('4123', 'UnionPay', 'UnionPay', 'revenue', 'revenue', 63),
  ('4124', 'JCB', 'JCB', 'revenue', 'revenue', 64),
  ('4130', 'QR이체매출', 'QR/Transfer', 'revenue', 'revenue', 70),
  ('4140', '현금입금', 'Cash Deposit', 'revenue', 'revenue', 80)
ON CONFLICT (code) DO NOTHING;
