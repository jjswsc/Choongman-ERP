-- 공지사항 데이터만 삭제 (테스트 기간 공지)
-- 읽음 상태 → 공지 순서로 삭제 (FK 참조)
TRUNCATE TABLE notice_reads CASCADE;
TRUNCATE TABLE notices CASCADE;
