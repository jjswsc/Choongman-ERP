-- ============================================================
-- 카드 계정과목: 한국 은행 → 태국 기준 브랜드로 변경
-- Visa, Master, UnionPay, JCB
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

UPDATE account_subjects SET name = 'Visa', name_en = 'Visa' WHERE code = '4121';
UPDATE account_subjects SET name = 'Master', name_en = 'Master' WHERE code = '4122';
UPDATE account_subjects SET name = 'UnionPay', name_en = 'UnionPay' WHERE code = '4123';
UPDATE account_subjects SET name = 'JCB', name_en = 'JCB' WHERE code = '4124';
