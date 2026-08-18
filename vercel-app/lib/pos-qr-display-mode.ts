/** 매장별 KBank Thai QR 표시·승인 경로 (pos_printer_settings.pos_qr_display_mode) */
export type PosQrDisplayMode = 'cashier' | 'edc_mirror' | 'edc_native'

export function normalizePosQrDisplayMode(raw: unknown): PosQrDisplayMode {
  const s = String(raw || '')
    .trim()
    .toLowerCase()
    .replace(/-/g, '_')
  if (s === 'edc_mirror' || s === 'edc_display' || s === 'mirror') return 'edc_mirror'
  if (s === 'edc_native' || s === 'native' || s === 'edc') return 'edc_native'
  return 'cashier'
}

/** Windows 하이브리드 결제 모달 기본 QR 탭 */
export function defaultPayQrTypeForStore(
  mode: PosQrDisplayMode,
  hasHybridShell: boolean
): 'THAI_QR' | 'EDC' {
  if (!hasHybridShell) return 'THAI_QR'
  return mode === 'cashier' ? 'THAI_QR' : 'EDC'
}

/** LinkPOS tx70 — EDC 펌웨어 QR(기기에서 ตรวจสอบรายการ 필요). edc_mirror 에서는 사용 안 함 */
export function shouldUseLinkposNativeQr(
  mode: PosQrDisplayMode,
  paymentQrShowOnEdc: boolean
): boolean {
  return Boolean(paymentQrShowOnEdc) && mode === 'edc_native'
}

/** KBank Generate QR 문자열을 EDC 화면에 mirror (display_qr) */
export function shouldMirrorKbankQrToEdc(
  mode: PosQrDisplayMode,
  paymentQrShowOnEdc: boolean
): boolean {
  if (!paymentQrShowOnEdc) return false
  return mode === 'edc_mirror' || mode === 'edc_native'
}
