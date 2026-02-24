-- 직원 테이블에 ID카드 사진 URL 컬럼 추가 (data URL 또는 외부 URL 저장)
ALTER TABLE employees ADD COLUMN IF NOT EXISTS id_card_photo TEXT DEFAULT NULL;
