-- 공지사항 관리「발송 내역」에 쌓인 업무일지 자동알림 정리
-- title이 [업무일지]로 시작하거나 sender가 '업무일지'인 notices 삭제
-- (검토 결과 알림은 sender가 관리자 이름인 경우가 많으므로 title 패턴 필수)
--
-- 앱 코드: getSentNotices / getNoticeSenders / 수신 통계에서 업무일지 제외
-- 이후 신규 업무일지 알림은 notices에 insert하지 않음(FCM만)

-- 1) 미리보기
SELECT id, sender, title, created_at
FROM notices
WHERE title LIKE '[업무일지]%'
   OR TRIM(COALESCE(sender, '')) = '업무일지'
ORDER BY created_at DESC;

-- 2) 수신 확인
DELETE FROM notice_reads
WHERE notice_id IN (
  SELECT id
  FROM notices
  WHERE title LIKE '[업무일지]%'
     OR TRIM(COALESCE(sender, '')) = '업무일지'
);

-- 3) 본문
DELETE FROM notices
WHERE title LIKE '[업무일지]%'
   OR TRIM(COALESCE(sender, '')) = '업무일지';
