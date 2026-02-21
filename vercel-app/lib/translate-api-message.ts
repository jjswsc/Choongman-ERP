/**
 * API 응답의 한글 message를 i18n key로 매핑하여 선택한 언어로 표시
 */
/** API message(한글) -> i18n key 매핑 */
const API_MESSAGE_TO_KEY: Record<string, string> = {
  // 휴가
  "✅ 신청 완료": "leaveRequestSuccess",
  "진단서가 업로드되었습니다.": "leaveCertUploaded",
  "처리되었습니다.": "processSuccess",
  "잘못된 요청입니다.": "invalidRequest",
  "승인 또는 반려를 선택해 주세요.": "selectApproveOrReject",
  "해당 휴가 신청을 찾을 수 없습니다.": "leaveRequestNotFound",
  "해당 매장의 휴가만 승인할 수 있습니다.": "leaveStoreOnly",
  "해당 날짜는 휴가일입니다. 긴급 인정할 수 없습니다.": "leaveDayCannotEmergencyApprove",

  // 사용 확정
  "✅ 사용 확정 완료": "confirmUsageDone",

  // 주문
  "✅ 주문 완료": "orderSuccess",
  "거절 사유를 입력해 주세요.": "orderRejectReasonRequired",
  "완료되었습니다.": "receiveDone",

  // 패티캐시
  "등록되었습니다.": "pettySaved",

  // 주문/근태 승인
  "처리가 완료되었습니다.": "attProcessSuccess",
  "해당 기록을 찾을 수 없습니다.": "attRecordNotFound",
  "해당 매장의 근태만 승인할 수 있습니다.": "attStoreOnly",

  // 공지
  "공지사항이 등록되었습니다.": "noticeSentSuccess",

  // 로그인/권한
  "권한 없음": "msg_no_admin_permission",
  "관리자 권한이 없습니다.": "msg_no_admin_permission",
  "퇴사된 계정은 사용할 수 없습니다.": "msg_resigned_account_blocked",

  // 공통
  "수정되었습니다.": "msg_saved",
  "저장되었습니다.": "msg_saved",
  "삭제되었습니다.": "msg_delete_ok",
  "✅ 삭제되었습니다.": "msg_delete_ok",
  "추가되었습니다.": "msg_add_ok",
  "변경되었습니다.": "msg_updated",

  // 비밀번호
  "비밀번호가 변경되었습니다. 다시 로그인해 주세요.": "pw_success",

  // 직원
  "✅ 신규 직원이 등록되었습니다.": "emp_registered",
  "✅ 직원 정보가 수정되었습니다.": "emp_updated",

  // 점검
  "저장됨": "msg_saved",

  // 본사 정보
  "본사 정보가 수정되었습니다.": "headOfficeUpdated",
  "본사 정보가 등록되었습니다.": "headOfficeSaved",

  // 메뉴 권한
  "메뉴 권한이 저장되었습니다.": "menuPermissionSaved",

  // 공지 삭제
  "공지가 삭제되었습니다.": "noticeDeleted",

  // 재고
  "적정재고가 수정되었습니다.": "stockSafeUpdated",
  "적정재고가 저장되었습니다.": "stockSafeSaveSuccess",
  "재고가 조정되었습니다.": "stockAdjustSuccess",

  // 발주
  "발주가 저장되었습니다.": "purchaseOrderSuccess",

  // 방문
  "매장과 사용자 정보가 필요합니다.": "visitStoreRequired",
  "유효하지 않은 방문 유형입니다.": "visitInvalidType",

  // 시간표
  "매장과 기준 월요일이 필요합니다.": "att_schedule_store_required",

  // 출퇴근
  "위치 확인 대기 중입니다.": "attGpsPendingSaved",
}

/**
 * API 응답 message를 현재 언어로 번역.
 * @param msg API에서 반환한 message (한글 등)
 * @param t useT(lang) 결과
 * @returns 번역된 문자열. 매핑 없으면 원본 반환
 */
export function translateApiMessage(
  msg: string | undefined,
  t: (k: string) => string
): string {
  if (!msg || typeof msg !== "string") return ""
  const trimmed = msg.trim()
  const key = API_MESSAGE_TO_KEY[trimmed]
  if (key) return t(key)
  // "처리 실패:" 등 접두사 패턴
  if (trimmed.startsWith("처리 실패:"))
    return t("processFail") + trimmed.slice("처리 실패:".length)
  if (trimmed.startsWith("저장 실패:"))
    return t("msg_save_fail") + trimmed.slice("저장 실패:".length)
  if (trimmed.startsWith("삭제 실패:"))
    return t("msg_delete_fail") + trimmed.slice("삭제 실패:".length)
  if (trimmed.startsWith("수정 실패:"))
    return t("msg_modify_fail") + trimmed.slice("수정 실패:".length)
  if (trimmed.startsWith("추가 실패:"))
    return t("msg_add_fail") + trimmed.slice("추가 실패:".length)
  if (/^✅ \d+건 입고 완료!?$/.test(trimmed))
    return t("inSaveSuccess")
  if (/^✅ \d+건의 강제 출고/.test(trimmed))
    return t("outSaveSuccess")
  // 방문: "✅ 방문시작 완료!" / "✅ 방문종료 완료! (30분 체류)"
  const visitMatch = trimmed.match(/^✅ (방문시작|방문종료) 완료!( \((\d+)분 체류\))?$/)
  if (visitMatch)
    return visitMatch[2] ? t("visitCompleteWithDuration").replace("{min}", visitMatch[3]!) : t("visitComplete")
  // 방문/출퇴근: 위치 부적합 (30m/100m 등 거리 초과)
  const locMatch = trimmed.match(/^❌ 위치 부적합! 매장 근처\(\d+m 이내\)가 아닙니다\. \(현재 거리: (\d+)m\)$/)
  if (locMatch) return t("attLocationTooFar").replace("{m}", locMatch[1]!)
  // 출근: 매장 GPS 미등록
  const gpsNotRegMatch = trimmed.match(/^❌ (.+) 매장의 위치\(GPS\)가 등록되지 않아 출근 기록이 불가합니다\. 관리자에게 문의해 주세요\.$/)
  if (gpsNotRegMatch) return t("attStoreGpsNotRegistered").replace("{store}", gpsNotRegMatch[1]!)
  // 방문: 서버 오류
  if (trimmed.startsWith("❌ 서버 저장 오류:"))
    return t("visitServerError") + ": " + trimmed.slice("❌ 서버 저장 오류:".length)
  // 시간표: "매장명 해당 주 시간표가 삭제되었습니다."
  if (/ .+ 해당 주 시간표가 삭제되었습니다\.$/.test(trimmed))
    return t("att_schedule_deleted")
  // 시간표: "매장명 주간 시간표가 저장되었습니다!"
  if (/ .+ 주간 시간표가 저장되었습니다!$/.test(trimmed))
    return t("att_schedule_saved")
  // 출퇴근: "✅ 출근 완료! (정상)" 등
  const attMatch = trimmed.match(/^✅ (출근|퇴근|휴식시작|휴식종료) 완료! \((.+)\)$/)
  if (attMatch) {
    const typeKey: Record<string, string> = { 출근: "attInComplete", 퇴근: "attOutComplete", 휴식시작: "attBreakComplete", 휴식종료: "attResumeComplete" }
    const statusKey: Record<string, string> = { 정상: "statusNormal", 지각: "statusLate", 조퇴: "statusEarly", 연장: "statusOvertime" }
    const typeT = t(typeKey[attMatch[1]] || "msg_done")
    const statusT = t(statusKey[attMatch[2]] || attMatch[2])
    return `✅ ${typeT}! (${statusT})`
  }
  return msg
}
