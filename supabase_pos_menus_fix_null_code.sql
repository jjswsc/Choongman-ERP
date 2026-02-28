-- ============================================================
-- pos_menus: code가 NULL인 행 수정 (NOT NULL 제약 위반 해결)
-- 사용법: Supabase 대시보드 > SQL Editor > 이 스크립트만 단독 실행
-- ============================================================

-- 1. NOT NULL 제약 임시 완화
ALTER TABLE pos_menus ALTER COLUMN code DROP NOT NULL;

-- 2. code가 NULL 또는 빈 문자열인 행에 코드 부여
UPDATE pos_menus
SET code = 'M' || id::text
WHERE code IS NULL OR COALESCE(TRIM(code), '') = '';

-- 3. NOT NULL 제약 복원
ALTER TABLE pos_menus ALTER COLUMN code SET NOT NULL;
