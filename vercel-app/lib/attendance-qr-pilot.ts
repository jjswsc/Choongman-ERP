import { isOfficeStore } from '@/lib/permissions'

function readAttendanceQrPilotOfficeOnlyFlag(): string {
  return String(
    process.env.NEXT_PUBLIC_ATTENDANCE_QR_PILOT_OFFICE_ONLY ??
      process.env.ATTENDANCE_QR_PILOT_OFFICE_ONLY ??
      '0'
  )
    .trim()
    .toLowerCase()
}

/** true: QR 출퇴근은 오피스(본사) 소속 직원만(롤백용). false: 전 매장 QR */
export function isAttendanceQrPilotOfficeOnly(): boolean {
  const raw = readAttendanceQrPilotOfficeOnlyFlag()
  return raw !== '0' && raw !== 'false' && raw !== 'no'
}

/** 직원 소속 매장 기준 QR 출퇴근 사용 가능 여부 */
export function canEmployeeUseAttendanceQr(employeeStore: string): boolean {
  if (!isAttendanceQrPilotOfficeOnly()) return true
  return isOfficeStore(employeeStore)
}

/** 전 매장 QR 전환 시 GPS 출퇴근 대신 QR 토큰 필수 */
export function isAttendanceQrRequiredForAllStores(): boolean {
  return !isAttendanceQrPilotOfficeOnly()
}
