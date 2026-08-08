/**
 * API 응답의 한글 message를 i18n key로 매핑하여 선택한 언어로 표시
 */

import { ACCOUNT_SUBJECT_HEADER_MESSAGE_KO } from '@/lib/account-subject-header-messages'
import { BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE } from '@/lib/bank-expense-via-expense-mgmt'

/** API message(한글) -> i18n key 매핑 */
const API_MESSAGE_TO_KEY: Record<string, string> = {
  // 휴가
  "✅ 신청 완료": "leaveRequestSuccess",
  "증명서가 업로드되었습니다.": "leaveCertUploaded",
  "진단서가 업로드되었습니다.": "leaveCertUploaded",
  "증빙 서류가 업로드되었습니다.": "leaveCertUploaded",
  "처리되었습니다.": "processSuccess",
  "잘못된 요청입니다.": "invalidRequest",
  "승인 또는 반려를 선택해 주세요.": "selectApproveOrReject",
  "해당 휴가 신청을 찾을 수 없습니다.": "leaveRequestNotFound",
  "해당 매장의 휴가만 승인할 수 있습니다.": "leaveStoreOnly",
  "반려 사유를 입력해 주세요.": "leaveRejectReasonRequired",
  "해당 날짜는 휴가일입니다. 긴급 인정할 수 없습니다.": "leaveDayCannotEmergencyApprove",

  // 사용 확정
  "✅ 사용 확정 완료": "confirmUsageDone",

  // 주문
  "✅ 주문 완료": "orderSuccess",
  "거절 사유를 입력해 주세요.": "orderRejectReasonRequired",
  "완료되었습니다.": "receiveDone",
  "본사 정산분이 없어 Order 미수금을 제거했습니다.": "syncRecRemovedHqZero",
  "미수금을 재계산해 반영했습니다.": "syncRecUpdated",
  "삭제된 주문의 미수금 행을 제거했습니다.": "syncRecOrphanRemoved",
  "주문을 찾을 수 없습니다.": "syncRecOrderNotFound",
  "수령 완료된 주문만 동기화할 수 있습니다.": "syncRecNotDelivered",
  "매장명이 없어 미수금을 반영할 수 없습니다.": "syncRecNoStoreName",
  "권한이 없습니다.": "apiPermissionDenied",
  no_store_name: "syncRecNoStoreName",

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
  "Login Failed": "msg_login_failed",
  "퇴사된 계정은 사용할 수 없습니다.": "msg_resigned_account_blocked",
  "서버에 일시적으로 연결할 수 없습니다. 인터넷 상태를 확인하고 잠시 후 다시 시도해 주세요.":
    "msg_login_server_unavailable",

  // 공통
  "수정되었습니다.": "msg_saved",
  "저장되었습니다.": "msg_saved",
  "삭제되었습니다.": "msg_delete_ok",
  "✅ 삭제되었습니다.": "msg_delete_ok",
  "추가되었습니다.": "msg_add_ok",
  "변경되었습니다.": "msg_updated",
  "프로모션과 연동된 메뉴는 마케팅 > 프로모션 관리에서 수정하세요.": "posMenuPromoLinkedEdit",

  // POS 메뉴 노출 매장
  "신규 메뉴는 노출 매장을 1개 이상 선택해야 합니다.": "posMenuVisibleStoresRequiredNewMenu",
  "노출 매장을 1개 이상 선택해 주세요.": "posMenuVisibleStoresPickAtLeastOne",
  pos_business_open_required: "posBusinessOpenRequiredBody",
  pos_drawer_pin_invalid_format: "posDrawerPinInvalidFormat",
  pos_drawer_pin_wrong: "posDrawerPinWrong",
  pos_drawer_pin_current_required: "posDrawerPinCurrentRequired",
  payment_exceeds_total: "posPaymentExceedsTotal",
  "포장(takeout) 주문만 테이블로 옮길 수 있습니다.": "posTakeoutToTableOnlyTakeout",
  "매장(홀) 주문만 이동할 수 있습니다.": "posTableMoveDineInOnly",
  "이미 주문이 있는 테이블입니다. 빈 테이블로 이동하거나 합석 기능을 사용해 주세요.": "posTableMoveTargetOccupied",
  "완료·취소된 주문은 이동할 수 없습니다.": "posTableMoveClosedOrder",

  // POS 단말 역할 제한
  "단말 대수 설정은 본사(OFFICE) 직원만 변경할 수 있습니다.": "posDeviceRoleLimitsAdminDenied",
  "단말 대수 설정은 POS 관리자만 변경할 수 있습니다.": "posDeviceRoleLimitsAdminDenied",
  "단말 대수 설정은 본사·매장 매니저만 변경할 수 있습니다.": "posDeviceRoleLimitsAdminDenied",
  "메인 POS는 관리자 단말 설정에서 지정해야 합니다.": "posDeviceRoleLockedApi",
  "단말 역할(메인/주문)은 관리자 단말 설정에서만 변경할 수 있습니다.": "posDeviceRoleLockedApi",

  // 비밀번호
  "비밀번호가 변경되었습니다. 다시 로그인해 주세요.": "pw_success",
  "현재 비밀번호가 일치하지 않습니다. 비밀번호 분실 시 슈퍼바이저팀에 문의해 주세요.": "msg_pw_current_wrong_contact_supervisor",

  // 직원
  "✅ 신규 직원이 등록되었습니다.": "emp_registered",
  "✅ 직원 정보가 수정되었습니다.": "emp_updated",
  "적정인원이 저장되었습니다.": "msg_saved",

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
  "미래 날짜로는 재고를 조정할 수 없습니다.": "stockAdjustFutureDateBlocked",
  "기준일 형식이 올바르지 않습니다. (YYYY-MM-DD)": "stockAdjustBadAsOfDate",

  // 발주
  "발주가 저장되었습니다.": "purchaseOrderSuccess",
  "이미 입고가 등록된 발주는 취소할 수 없습니다.": "poCancelBlockedInbound",
  "통장 거래와 연결된 발주는 취소할 수 없습니다.": "poCancelBlockedBank",

  // 방문
  "매장과 사용자 정보가 필요합니다.": "visitStoreRequired",
  "유효하지 않은 방문 유형입니다.": "visitInvalidType",

  // 시간표
  "매장과 기준 월요일이 필요합니다.": "att_schedule_store_required",

  // 출퇴근 (submitAttendance)
  "위치 확인 대기 중입니다.": "attGpsPendingSaved",
  "❌ 위치 확인 실패! GPS를 켜고 매장 근처에서 다시 시도해 주세요. (현재 위치를 확인할 수 없습니다)": "attLocationVerifyFail",
  "❌ QR 출퇴근은 현재 오피스(본사) 직원 파일럿 중입니다. 매장 직원은 GPS로 출퇴근해 주세요.": "attQrOfficePilotOnly",
  "❌ QR 코드가 유효하지 않거나 만료되었습니다. 키오스크 QR을 다시 스캔해 주세요.": "attQrInvalid",
  "❌ QR 매장과 소속 매장이 일치하지 않습니다.": "attQrStoreMismatch",
  "❌ QR 매장과 방문 매장이 일치하지 않습니다.": "visitQrStoreMismatch",
  "❌ 매장 출퇴근 QR을 스캔해 주세요.": "visitQrRequired",
  "직원 정보를 확인할 수 없습니다. 다시 로그인 후 시도해 주세요.": "attErrEmployeeNotFound",
  "미종료 근무가 있습니다. 먼저 퇴근을 기록한 뒤 새 출근을 진행해 주세요.": "attErrUnfinishedShift",
  "출근을 먼저 기록해 주세요. 오늘 출근 기록이 없으면 휴식·재개·퇴근을 기록할 수 없습니다.": "attErrClockInFirst",
  "출근 후 퇴근 전 근무 세션에서만 휴식·재개를 기록할 수 있습니다.": "attErrBreakOnlyInWorkSession",
  "이미 휴식 중입니다. 휴식종료를 먼저 기록해 주세요.": "attErrAlreadyOnBreak",
  "휴식시작 기록이 있어야 휴식종료를 기록할 수 있습니다.": "attErrNeedBreakStartForEnd",

  // 회계/통장/지출 관리
  "본사 권한만 등록할 수 있습니다.": "officeRoleOnly",
  "통장 거래 ID가 필요합니다.": "bankTxIdRequired",
  "통장 거래를 찾을 수 없습니다.": "bankTxNotFound",
  "출금 거래만 등록할 수 있습니다.": "withdrawOnlyAllowed",
  "출금 거래만 연결할 수 있습니다.": "cardApiWithdrawOnly",
  "이미 연결된 통장 거래입니다.": "bankTxAlreadyLinked",
  "이미 지급예정과 연결된 통장 거래입니다.": "bankTxAlreadyLinked",
  "통장 거래 정보가 올바르지 않습니다.": "bankTxInvalid",
  "지출 발생 등록에 실패했습니다.": "expenseAccrualCreateFailed",
  "지출 발생으로 등록되었습니다.": "expenseAccrualRegistered",
  "매입 대금으로 등록되었습니다.": "purchasePaymentRegistered",
  "지급 예정 ID가 필요합니다.": "expensePlanIdRequired",
  "지급 예정 데이터를 찾을 수 없습니다.": "expensePlanNotFound",
  "지급예정과 연결된 거래는 삭제할 수 없습니다. 지급예정 탭에서 처리해 주세요.": "planEditableOnlyBeforeApproval",
  "승인 전(요청) 상태에서만 수정/삭제할 수 있습니다.": "planEditableOnlyBeforeApproval",
  "승인 전(요청) 상태에서만 수정할 수 있습니다.": "planEditableOnlyBeforeApproval",
  "이미 지급된 금액이 있어 수정할 수 없습니다.": "planEditablePaidBlocked",
  "요청(미승인) 또는 반려 상태에서만 삭제할 수 있습니다. 승인된 건은 지출 검색에서 삭제해 주세요.":
    "planDeletableOnlyBeforeApproval",
  "승인되었습니다.": "att_approved",
  "반려되었습니다.": "att_rejected",
  "이미 지급 완료된 건입니다.": "alreadyPaid",
  "이미 지급 완료된 건은 반려할 수 없습니다.": "alreadyPaidCannotReject",
  "관리자 승인 후 집행할 수 있습니다.": "approvalRequiredBeforeExecution",
  "반려된 지급 예정은 집행할 수 없습니다.": "rejectedPlanCannotExecute",
  "지급 처리되었습니다.": "paymentProcessed",
  [BANK_EXPENSE_VIA_EXPENSE_MGMT_MESSAGE]: "bankExpenseViaExpenseMgmt",
  "지출 발생 ID가 필요합니다.": "expenseAccrualIdRequired",
  "지급 금액을 입력해 주세요.": "expensePaymentAmountRequired",
  "지급 수단은 bank 또는 petty 이어야 합니다.": "expensePaymentMethodInvalid",
  "지급일 형식이 올바르지 않습니다.": "expensePaymentDateInvalid",
  "지출 발생 데이터를 찾을 수 없습니다.": "expenseAccrualNotFound",
  "승인 상태를 확인할 수 없습니다.": "expenseAccrualStatusUnknown",
  "이미 미지급에 지급(Payment) 행이 등록된 지급예정입니다. 중복 집행할 수 없습니다.":
    "expenseDuplicatePaymentBlocked",
  "전도금 보충·카드 대금 청구는 통장 연동으로만 집행할 수 있습니다.": "expensePrepayBankOnly",
  "패티캐시 매장을 선택해 주세요.": "pettyStoreRequired",
  "이미 연결된 통장 출금입니다.": "bankWithdrawAlreadyLinked",
  "이미 다른 지출/매입과 연결된 통장 거래입니다.": "bankTxLinkedOtherExpense",
  "통장 지급은 계좌를 선택해 주세요.": "bankPaymentAccountRequired",
  "통장 출금 등록에 실패했습니다.": "bankWithdrawRegisterFailed",
  "카드 정보가 없습니다. 지급예정을 다시 확인해 주세요.": "cardInfoMissingForPayment",
  "패티 지급은 매장을 선택해 주세요.": "pettyPaymentStoreRequired",
  "선택한 통장 거래를 찾을 수 없습니다.": "bankTxNotFound",
  [ACCOUNT_SUBJECT_HEADER_MESSAGE_KO]: "accountSubjectHeaderNotAllowed",
  "존재하지 않는 계정과목입니다.": "accountSubjectNotFound",
  "yearMonth(YYYY-MM)가 필요합니다.": "depYearMonthRequired",
  "자산 ID가 필요합니다.": "fixedAssetIdRequired",
  "해당 자산이 없습니다.": "fixedAssetNotFound",
  "자산이 처분 처리되었습니다.": "fixedAssetDisposedSuccess",
  "자산이 복구되었습니다.": "fixedAssetRestoredSuccess",
  "동일한 자산코드가 이미 있습니다.": "fixedAssetCodeDuplicate",

  // 매장 수리 사진 Storage
  "수리 사진 저장소가 설정되지 않았습니다.": "repair_photo_storage_not_configured",
  "이미지 또는 동영상 파일만 업로드할 수 있습니다.": "repair_upload_media_type",
  "JPG, PNG, GIF, WebP 이미지 또는 MP4, WebM 동영상만 업로드할 수 있습니다.":
    "posCustomerIdleMediaTypeInvalid",
  "Only JPG, PNG, GIF, WebP images or MP4, WebM videos can be uploaded.":
    "posCustomerIdleMediaTypeInvalid",
  "HEIC/HEIF photos are not supported. Please export or Save As JPG/PNG, then upload again.":
    "posCustomerIdleMediaHeicUnsupported",
  "이미지는 5MB 이하여야 합니다.": "repair_upload_image_max_5mb",
  "이미지는 5MB 이하만 업로드할 수 있습니다.": "repair_upload_image_max_5mb",
  "이미지는 4MB 이하만 업로드할 수 있습니다.": "posCustomerIdleMediaImageTooLarge",
  "Images must be 4MB or smaller.": "posCustomerIdleMediaImageTooLarge",
  "동영상은 50MB 이하여야 합니다.": "repair_upload_video_max_50mb",
  "동영상은 50MB 이하만 업로드할 수 있습니다.": "posCustomerIdleMediaVideoTooLarge",
  "Videos must be 50MB or smaller.": "posCustomerIdleMediaVideoTooLarge",
  "동영상은 직접 업로드(서명 URL)만 지원합니다. 다시 시도해 주세요.": "posCustomerIdleMediaUploadFail",
  "Videos must use direct upload. Please try again.": "posCustomerIdleMediaUploadFail",
  "JPG, PNG, GIF, WebP 이미지만 서버 업로드할 수 있습니다.": "posCustomerIdleMediaTypeInvalid",
  'Storage bucket "pos-menu-images" is missing. Create it in Supabase Dashboard > Storage.':
    "posCustomerIdleMediaUploadFail",
  "Store code is required.": "posCustomerIdleMediaUploadFail",
  "A file is required.": "posCustomerIdleMediaUploadFail",
  "Media upload failed.": "posCustomerIdleMediaUploadFail",

  "업로드 준비 실패": "msg_upload_fail",
  "업로드 준비에 실패했습니다.": "msg_upload_fail",
  "첨부 파일이 너무 커서 저장할 수 없습니다. PDF·이미지를 다시 업로드해 주세요.":
    "expenseAccrualAttachTooLarge",
  "첨부 URL 형식이 올바르지 않습니다.": "expenseAccrualAttachFail",

  // 주문 수령 / 공통 API 타임아웃 (클라이언트)
  "요청 시간이 초과되었습니다. 네트워크를 확인한 뒤 다시 시도해 주세요.": "apiRequestTimeout",

  // POS 쿠폰 검증 (validatePosCoupons / pos-coupon-domain)
  "쿠폰 코드를 입력하세요.": "posCouponPleaseEnterCode",
  "유효하지 않거나 만료된 쿠폰입니다.": "posCouponInvalidOrExpired",
  "아직 사용 기간이 아닙니다.": "posCouponNotYetValid",
  "사용 기간이 지났습니다.": "posCouponPastValidPeriod",
  "이미 사용된 쿠폰입니다.": "posCouponAlreadyUsed",
  "사용 가능한 회원 쿠폰이 없습니다.": "posCouponNoMemberIssue",
  "쿠폰 사용 한도를 초과했습니다.": "posCouponUsageLimitExceeded",
  "이 쿠폰은 수동 할인과 함께 사용할 수 없습니다.": "posCouponNoStackManual",
  "이 쿠폰은 다른 쿠폰과 함께 사용할 수 없습니다.": "posCouponNoStackOther",
  "적용 가능한 할인 금액이 없습니다.": "posCouponNoDiscountAmount",
  "장바구니에 쿠폰 대상 메뉴가 없습니다.": "posCouponNoEligibleMenu",
  "쿠폰 검증 중 오류가 발생했습니다.": "posCouponValidateError",

  // verify-auth / 공통 API
  "인증이 필요합니다. 다시 로그인해 주세요.": "msg_auth_required_relogin",
  "매장(store)을 지정하세요.": "companyHybridErrStoreRequired",
  "이 매장에 대한 권한이 없습니다.": "companyHybridErrStoreForbidden",
  "전체 문서 조회 권한이 없습니다.": "companyHybridErrListAllForbidden",
  "본사 권한이 필요합니다.": "msg_office_permission_required",
  "매니저 이상 권한이 필요합니다.": "msg_manager_or_higher_required",
  "발주 일시중지 설정은 본사·물류 권한이 필요합니다.": "msg_order_pause_permission_required",

  "카드대금 연동 대기열에 등록되었습니다.": "expenseRegisterCardBillQueued",
  "패티캐시 연동 대기열에 등록되었습니다.": "expenseRegisterPettyQueued",
  "이체(transfer) 구분 출금만 카드대금 연동 대기열에 넣을 수 있습니다.":
    "cardApiTransferOnlyForQueue",
  "이체(transfer) 구분 출금만 패티캐시 연동 대기열에 넣을 수 있습니다.":
    "pettyApiTransferOnlyForQueue",
  "이체(transfer) 구분 출금만 패티캐시 보충으로 연결할 수 있습니다.":
    "pettyApiReplenishTransferOnly",
  "통장 거래 ID와 매장이 필요합니다.": "pettyApiBankAndStoreRequired",
  "이미 다른 내역과 연결된 통장 출금입니다.": "pettyApiAlreadyLinkedOther",
  "패티캐시 보충 등록에 실패했습니다.": "pettyApiRegisterFailed",
  "DB에 bank_transaction_id 컬럼이 없습니다. sql/petty_cash_bank_link.sql을 실행해 주세요.":
    "pettyApiDbMigrationRequired",
  "패티캐시 보충 매장을 선택해 주세요.": "pettyApiReplenishStoreRequired",
  "이미 지출·매입·카드·패티캐시와 연결된 통장 거래입니다.":
    "cardApiAlreadyLinkedAny",
  "이미 지출·매입 또는 카드와 연결된 통장 거래입니다.":
    "cardApiAlreadyLinkedAny",
  "통장 거래 ID와 카드가 필요합니다.": "cardApiBankAndCardRequired",
  "이미 지출·매입 관리에 연결된 통장 거래입니다. 카드 지출로 중복 등록할 수 없습니다.":
    "cardApiAlreadyLinkedExpense",
  "이미 카드 거래와 연결된 통장 출금입니다.": "cardApiAlreadyLinkedCard",
  "카드를 찾을 수 없습니다.": "cardApiCardNotFound",
  "카드 지출 등록에 실패했습니다.": "cardApiRegisterFailed",
  "카드 대금 ID가 필요합니다.": "cardApiBillIdRequired",
  "카드 대금을 찾을 수 없습니다.": "cardApiBillNotFound",
  "통장 연동 카드 대금(총액) 건만 배분할 수 있습니다.": "cardApiBillHeaderOnly",
  "계정과목·금액을 1건 이상 입력해 주세요.": "cardApiAllocationLineRequired",
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
  if (trimmed.startsWith("업로드 준비 실패:"))
    return t("msg_upload_fail") + trimmed.slice("업로드 준비 실패:".length)
  if (trimmed.startsWith("업로드 실패:"))
    return t("msg_upload_fail") + trimmed.slice("업로드 실패:".length)
  if (trimmed.startsWith("action은 approve 또는 reject 이어야 합니다."))
    return t("approveRejectActionRequired")
  if (trimmed.startsWith("승인 권한이 없습니다."))
    return t("expenseApprovalPermissionDeniedDetail")
  if (trimmed.startsWith("부분 지급은 허용되지 않습니다.")) {
    const remainMatch = trimmed.match(/잔액: ([\d,]+)\)/)
    if (remainMatch)
      return t("partialPaymentNotAllowedWithRemain").replace("{remain}", remainMatch[1]!)
    return t("partialPaymentNotAllowed")
  }
  const amountDetailMatch = trimmed.match(
    /^금액이 일치하지 않습니다\. \(통장: ([\d,]+), 지급: ([\d,]+)\)$/
  )
  if (amountDetailMatch)
    return t("amountMismatchDetail")
      .replace("{bankAmount}", amountDetailMatch[1]!)
      .replace("{paymentAmount}", amountDetailMatch[2]!)
  const dateDetailMatch = trimmed.match(
    /^날짜가 일치하지 않습니다\. \(통장: ([^,]+), 지급: ([^)]+)\)$/
  )
  if (dateDetailMatch)
    return t("dateMismatchDetail")
      .replace("{bankDate}", dateDetailMatch[1]!)
      .replace("{paymentDate}", dateDetailMatch[2]!)
  if (trimmed.startsWith("금액이 일치하지 않습니다."))
    return t("amountMismatch")
  if (trimmed.startsWith("날짜가 일치하지 않습니다."))
    return t("dateMismatch")
  const cardAllocMatch = trimmed.match(
    /^배분 합계\(฿(.+)\)가 카드 대금 총액\(฿(.+)\)과 일치해야 합니다\.$/
  )
  if (cardAllocMatch)
    return t("cardApiAllocationSumMismatch")
      .replace("{sum}", cardAllocMatch[1]!)
      .replace("{total}", cardAllocMatch[2]!)
  if (/^✅ \d+건 입고 완료!?$/.test(trimmed))
    return t("inSaveSuccess")
  if (/^✅ \d+건의 강제 출고/.test(trimmed))
    return t("outSaveSuccess")
  // 감가상각: "12건 분개되었습니다."
  const depPostedMatch = trimmed.match(/^(\d+)건 분개되었습니다\.$/)
  if (depPostedMatch)
    return t("dep_runResultPosted").replace("{count}", depPostedMatch[1]!)
  // 감가상각 미리보기: "12건 예상 (합계 ฿1,234)"
  const depPreviewMatch = trimmed.match(/^(\d+)건 예상 \(합계 ฿(.+)\)$/)
  if (depPreviewMatch)
    return t("dep_runResultPreview")
      .replace("{count}", depPreviewMatch[1]!)
      .replace("{amount}", depPreviewMatch[2]!)
  // 방문: "✅ 방문시작 완료!" / "✅ 방문종료 완료! (30분 체류)"
  const visitMatch = trimmed.match(/^✅ (방문시작|방문종료) 완료!( \((\d+)분 체류\))?$/)
  if (visitMatch)
    return visitMatch[2] ? t("visitCompleteWithDuration").replace("{min}", visitMatch[3]!) : t("visitComplete")
  // 방문/출퇴근: 위치 부적합 (30m/100m 등 거리 초과)
  const locMatch = trimmed.match(/^❌ 위치 부적합! 매장 근처\(\d+m 이내\)가 아닙니다\. \(현재 거리: (\d+)m\)$/)
  if (locMatch) return t("attLocationTooFar").replace("{m}", locMatch[1]!)
  // 출퇴근: 매장 GPS 미등록 (구문·현행 API 둘 다)
  const gpsNotRegNew = trimmed.match(
    /^❌ (.+)의 위치\(GPS\)가 등록되지 않아 출퇴근 기록이 불가합니다\. 관리자에게 문의해 주세요\.$/
  )
  const gpsNotRegOld = trimmed.match(
    /^❌ (.+) 매장의 위치\(GPS\)가 등록되지 않아 출근 기록이 불가합니다\. 관리자에게 문의해 주세요\.$/
  )
  if (gpsNotRegNew || gpsNotRegOld)
    return t("attStoreGpsNotRegistered").replace("{store}", (gpsNotRegNew || gpsNotRegOld)![1]!)
  // 방문: 서버 오류
  if (trimmed.startsWith("❌ 서버 저장 오류:"))
    return t("visitServerError") + ": " + trimmed.slice("❌ 서버 저장 오류:".length)
  // 시간표: "매장명 해당 주 시간표가 삭제되었습니다."
  if (/ .+ 해당 주 시간표가 삭제되었습니다\.$/.test(trimmed))
    return t("att_schedule_deleted")
  // 시간표: "매장명 주간 시간표가 저장되었습니다!"
  if (/ .+ 주간 시간표가 저장되었습니다!$/.test(trimmed))
    return t("att_schedule_saved")
  // 출퇴근: 오늘 이미 [유형] 중복
  const dupAttendance = trimmed.match(
    /^오늘 이미 \[(출근|퇴근|휴식시작|휴식종료)\] 기록이 있습니다\. 하루에 한 번만 기록할 수 있습니다\.$/
  )
  if (dupAttendance) {
    const typeToKey: Record<string, string> = {
      출근: "attDupTypeIn",
      퇴근: "attDupTypeOut",
      휴식시작: "attDupTypeBreakStart",
      휴식종료: "attDupTypeBreakEnd",
    }
    const tk = typeToKey[dupAttendance[1] || ""]
    if (tk) return t("attErrDuplicateTypeToday").replace("{type}", t(tk))
  }
  // submitAttendance 예외 메시지
  if (trimmed.startsWith("❌ 오류: ")) return t("attApiErrorPrefix") + trimmed.slice("❌ 오류: ".length)
  const posCouponMinOrder = trimmed.match(/^최소 주문 금액 (\d+(?:\.\d+)?)바트 이상이어야 합니다\.$/)
  if (posCouponMinOrder)
    return t("posCouponMinOrderRequired").replace("{amount}", posCouponMinOrder[1]!)
  const posCouponMaxPerOrder = trimmed.match(/^이 쿠폰은 주문당 최대 (\d+)장까지 사용할 수 있습니다\.$/)
  if (posCouponMaxPerOrder)
    return t("posCouponMaxPerOrderExceeded").replace("{max}", posCouponMaxPerOrder[1]!)
  const posCouponMaxReceipt = trimmed.match(/^영수증당 쿠폰은 최대 (\d+)장까지 사용할 수 있습니다\.$/)
  if (posCouponMaxReceipt)
    return t("posCouponMaxReceiptExceeded").replace("{max}", posCouponMaxReceipt[1]!)
  // 출퇴근: "✅ 출근 완료! (정상)" 등 (휴식종료 시 휴게초과·휴게정상 포함)
  const attMatch = trimmed.match(/^✅ (출근|퇴근|휴식시작|휴식종료) 완료! \((.+)\)$/)
  if (attMatch) {
    const typeKey: Record<string, string> = { 출근: "attInComplete", 퇴근: "attOutComplete", 휴식시작: "attBreakComplete", 휴식종료: "attResumeComplete" }
    const statusKey: Record<string, string> = {
      정상: "statusNormal",
      지각: "statusLate",
      조퇴: "statusEarly",
      연장: "statusOvertime",
      휴게초과: "att_status_break_over",
      휴게정상: "att_status_break_ok",
    }
    const typeT = t(typeKey[attMatch[1]] || "msg_done")
    const statusT = t(statusKey[attMatch[2]] || attMatch[2])
    return `✅ ${typeT}! (${statusT})`
  }
  return msg
}

/**
 * API message를 UI 노출용으로 안전하게 정규화.
 * - 매핑된 번역이 있으면 사용
 * - 비한국어 언어에서 한글 원문이 남으면 fallback으로 대체
 */
export function localizeApiMessage(
  msg: string | undefined,
  t: (k: string) => string,
  fallback: string,
  lang: string
): string {
  const translated = translateApiMessage(msg, t).trim()
  if (translated) {
    if (lang !== "ko" && /[가-힣]/.test(translated)) return fallback
    return translated
  }
  const raw = String(msg || "").trim()
  if (!raw) return fallback
  if (lang !== "ko" && /[가-힣]/.test(raw)) return fallback
  return raw
}
