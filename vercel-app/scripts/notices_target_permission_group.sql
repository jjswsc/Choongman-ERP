-- 공지사항 수신 대상에 '권한 그룹'(직원 role) 필터 추가
-- 사용: getNoticeOptions의 permissionGroups, sendNotice의 targetPermissionGroup, getMyNotices/수신자 매칭 시 참조

ALTER TABLE notices
  ADD COLUMN IF NOT EXISTS target_permission_group TEXT DEFAULT NULL;

COMMENT ON COLUMN notices.target_permission_group IS '수신 대상 권한 그룹. 쉼표 구분(예: director,manager). NULL/빈값=전체';
