/**
 * 결제(손님) 영수증 HTML — 매장별 안전 모드 등 플래그
 * (프린터/스토어 코드 표기 차이를 흡수)
 */

const ZW_SPACE = /[\u200B-\u200D\uFEFF]/g

/** 스토어 코드 비교용(보이지 않는 제로폭·양끝 공백 제거) */
export function normalizePosStoreCodeForFlags(raw: string): string {
  return String(raw || '')
    .replace(ZW_SPACE, '')
    .trim()
}

/**
 * 일부 80mm + Electron 인쇄 조합에서 CSS grid 2열이 좌우로 뜯기는 경우가 있어
 * 결제 영수증은 "초단순" 레이아웃(테이블/블록 위주)로 강제한다.
 */
export function shouldForceSimplePaymentReceiptForStore(storeCode: string | null | undefined): boolean {
  void storeCode
  // 전 매장 결제 영수증을 legacy 2열 경로로 통일(2026-05 운영 정책)
  return false
}

/**
 * 에까마이: 일부 드라이버에서 simple 모드가 오른쪽으로 쏠려 보이는 케이스 보정.
 * (기본 레이아웃은 유지하고 simple 경로에서만 좌우 인셋을 타이트하게 재지정)
 */
export function shouldUseTightSimpleReceiptInsetForStore(storeCode: string | null | undefined): boolean {
  const s0 = normalizePosStoreCodeForFlags(String(storeCode || ''))
  if (!s0) return false
  const s = s0.toLowerCase()
  if (s.includes('ekkamai') || s.includes('ekamai') || s.includes('eakkamai')) return true
  if (s.includes('เอกมัย')) return true
  return false
}

/**
 * 결제 영수증은 전 매장에서 동일한 legacy 2열 정렬을 사용한다.
 */
export function shouldUseLegacyAlignedPaymentReceiptForStore(storeCode: string | null | undefined): boolean {
  void storeCode
  return true
}

/** 후아막 계열은 설정값과 무관하게 결제 영수증 상단 로고를 강제 노출 */
export function shouldForcePaymentReceiptLogoForStore(storeCode: string | null | undefined): boolean {
  const s0 = normalizePosStoreCodeForFlags(String(storeCode || ''))
  if (!s0) return false
  const s = s0.toLowerCase()
  if (s.includes('huamak') || s.includes('huamark') || s.includes('huama')) return true
  if (s.includes('หัวหมาก')) return true
  return false
}
