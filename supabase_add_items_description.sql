-- 품목 테이블에 설명(description) 컬럼 추가
-- 모바일 발주/사용 시 신입 직원이 품목을 파악할 수 있도록 관리자에서 입력한 설명을 표시

ALTER TABLE items ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';

COMMENT ON COLUMN items.description IS '품목 설명 - 모바일 발주·사용 시 신입 직원용 안내 문구';
