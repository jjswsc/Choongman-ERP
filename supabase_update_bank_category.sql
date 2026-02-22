-- ============================================================
-- bank_transactions category 확장
-- loan=대여, advance=전도금, unclassified=미분류 (손익 제외)
-- 기존 데이터에는 영향 없음 (TEXT 컬럼에 새 값만 허용)
-- 사용법: Supabase SQL Editor에서 실행
-- ============================================================

COMMENT ON COLUMN bank_transactions.category IS 'transfer=이체/보충, expense=비용, fixed=고정비, correction=정정, loan=대여, advance=전도금, unclassified=미분류 (손익제외)';
