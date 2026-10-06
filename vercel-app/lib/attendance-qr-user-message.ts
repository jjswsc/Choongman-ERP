/** submitAttendance / submitStoreVisit 가 그대로 내려 주는 한글 안내. 화면 언어는 translate-api-message 가 바꿉니다. */
export const ATT_QR_MSG_WRONG_COMPANY =
  '❌ 이 QR은 다른 회사의 출퇴근 QR입니다. 이 회사 계정으로 키오스크에서 QR을 새로 만든 뒤, 그 화면을 스캔해 주세요.'

export const ATT_QR_MSG_EXPIRED =
  '❌ 출퇴근 QR이 바뀌었습니다. 매장에 켜 둔 화면의 QR을 다시 스캔해 주세요.'

export const ATT_QR_MSG_MODE_MISMATCH =
  '❌ 매장 QR 설정(고정/2시간 변경)과 스캔한 QR이 다릅니다. 매장 화면의 QR을 다시 스캔해 주세요.'

export const ATT_QR_MSG_INVALID =
  '❌ QR 코드가 유효하지 않거나 만료되었습니다. 키오스크 QR을 다시 스캔해 주세요.'

/** 검증 reason 을 직원에게 보여줄 안내로 바꿉니다. 다른 회사 QR을 만료로 뭉개지 않습니다. */
export function attendanceQrFailApiMessage(reason: string | undefined): string {
  switch (reason) {
    case 'tenant_mismatch':
      return ATT_QR_MSG_WRONG_COMPANY
    case 'expired_bucket':
      return ATT_QR_MSG_EXPIRED
    case 'mode_mismatch':
      return ATT_QR_MSG_MODE_MISMATCH
    default:
      return ATT_QR_MSG_INVALID
  }
}
