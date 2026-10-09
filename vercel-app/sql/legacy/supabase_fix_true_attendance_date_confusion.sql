-- ============================================================
-- True 매장 출퇴근 날짜 혼동 정리
-- 현상: 퇴근이 출근보다 먼저 찍힌 기록 (전날 세션 마감용으로 퇴근 먼저 누른 경우)
-- ============================================================

-- [1단계] 삭제 대상 조회: 같은 날 같은 사람 기준 '퇴근'이 '출근'보다 먼저 찍힌 기록
-- (방콕 시간 기준)
SELECT
  out_r.id AS 삭제할_id,
  out_r.store_name AS 매장,
  out_r.name AS 이름,
  out_r.log_at AT TIME ZONE 'Asia/Bangkok' AS 퇴근기록_방콕시간,
  (out_r.log_at AT TIME ZONE 'Asia/Bangkok')::date AS 날짜,
  in_r.log_at AT TIME ZONE 'Asia/Bangkok' AS 해당날_출근_방콕시간
FROM attendance_logs out_r
JOIN attendance_logs in_r
  ON out_r.store_name = in_r.store_name
 AND out_r.name = in_r.name
 AND (out_r.log_at AT TIME ZONE 'Asia/Bangkok')::date = (in_r.log_at AT TIME ZONE 'Asia/Bangkok')::date
 AND out_r.log_type = '퇴근'
 AND in_r.log_type = '출근'
 AND out_r.log_at < in_r.log_at
WHERE out_r.store_name ILIKE '%True%'
ORDER BY out_r.log_at DESC;

-- [2단계] 위 결과 확인 후, 삭제할 id 목록을 수동으로 지정하여 실행
-- 예: DELETE FROM attendance_logs WHERE id IN (123, 456, 789);

-- ============================================================
-- [3단계] 미래 시각 퇴근 기록 수정
-- 현상: 강제퇴근 인정으로 아직 오지 않은 시간(예: 19:14)이 기록된 경우
-- 수정: log_at을 created_at(승인 시각)으로 변경
-- ============================================================

-- [3-1] 수정 대상 조회 (log_at이 현재보다 미래인 퇴근 기록)
-- SELECT id, store_name, name, log_at AT TIME ZONE 'Asia/Bangkok' AS 퇴근_방콕, created_at
-- FROM attendance_logs
-- WHERE store_name ILIKE '%True%'
--   AND log_type = '퇴근'
--   AND log_at > NOW()
-- ORDER BY log_at DESC;

-- [3-2] 위 결과 확인 후, 미래 시각을 created_at으로 보정 (실행 즉시 적용)
-- UPDATE attendance_logs
-- SET log_at = created_at
-- WHERE store_name ILIKE '%True%'
--   AND log_type = '퇴근'
--   AND log_at > NOW();

-- [참고] True 매장 최근 출퇴근 100건 (상태 점검용)
-- SELECT id, store_name, name, log_type, log_at AT TIME ZONE 'Asia/Bangkok' AS log_at_bkk
-- FROM attendance_logs
-- WHERE store_name ILIKE '%True%'
-- ORDER BY log_at DESC
-- LIMIT 100;
