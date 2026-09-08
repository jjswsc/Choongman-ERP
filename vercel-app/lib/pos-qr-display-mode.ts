import { lookupChoongmanKbankStoreDefaultRow } from '@/lib/kbank-store-merchant-defaults'

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

/** True Digital Park 등 고객 모니터 없는 매장: 미저장이면 EDC mirror. 저장된 값은 유지. */
export function resolvePosQrDisplayModeForStore(storeCode: string, raw: unknown): PosQrDisplayMode {
  if (String(raw ?? '').trim()) return normalizePosQrDisplayMode(raw)
  const row = lookupChoongmanKbankStoreDefaultRow(storeCode)
  const fallback = row?.qrDisplayMode
  if (fallback === 'edc_mirror' || fallback === 'edc_native' || fallback === 'cashier') {
    return fallback
  }
  return 'cashier'
}

/**
 * Windows 하이브리드 결제 모달 기본 QR 탭.
 * edc_mirror 는 KBank Thai QR 생성 후 EDC에 그리므로 THAI_QR.
 * 「แสดงบนเครื่อง」탭은 LinkPOS tx70(기기 자체 QR) — Error -1 이 나는 매장이 많아 권장 모드에 쓰지 않음.
 */
export function defaultPayQrTypeForStore(
  mode: PosQrDisplayMode,
  hasHybridShell: boolean
): 'THAI_QR' | 'EDC' {
  if (!hasHybridShell) return 'THAI_QR'
  return mode === 'edc_native' ? 'EDC' : 'THAI_QR'
}

/** LinkPOS tx70 — EDC 펌웨어 QR(기기에서 ตรวจสอบรายการ 필요). edc_mirror 에서는 사용 안 함 */
export function shouldUseLinkposNativeQr(
  mode: PosQrDisplayMode,
  paymentQrShowOnEdc: boolean
): boolean {
  return Boolean(paymentQrShowOnEdc) && mode === 'edc_native'
}

/**
 * KBank Generate QR 문자열을 EDC 화면에 mirror (display_qr).
 * 관리자 「แสดง QR บนเครื่องรูด」만으로 동작 — 결제 탭 「แสดงบนเครื่อง」과 무관.
 */
export function shouldMirrorKbankQrToEdc(mode: PosQrDisplayMode): boolean {
  return mode === 'edc_mirror'
}
