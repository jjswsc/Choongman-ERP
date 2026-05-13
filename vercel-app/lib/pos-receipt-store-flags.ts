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
  const s0 = normalizePosStoreCodeForFlags(String(storeCode || ''))
  if (!s0) return false
  const s = s0.toLowerCase()
  // ASCII
  if (s.includes('ekkamai')) return true
  // 흔한 변형(철자·공백)
  if (s.includes('ekamai') || s.includes('eakkamai')) return true
  // 태국어 지역명(에까마이)
  if (s.includes('เอกมัย')) return true
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
