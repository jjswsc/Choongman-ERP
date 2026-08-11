/**
 * KBank Partner QR를 POS에서 쓰는 매장 판정 (클라이언트·서버 공통).
 * - CM Office 파일럿
 * - CHOONGMAN HUAMAK / SEACON (은행 MID 개통)
 * - 필요 시 KBANK_QR_TEST_STORE_CODES(서버)와 별도로 UI 허용 목록 확장
 */

function normalizeStoreLabel(value: string): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** 매장 코드·이름·표시명 후보를 정규화한 목록 */
export function collectNormalizedStoreLabels(values: Array<string | null | undefined>): string[] {
  return values.map((v) => normalizeStoreLabel(String(v || ''))).filter(Boolean)
}

export function isKbankQrPilotStoreLabel(normalized: string): boolean {
  if (!normalized) return false
  if (normalized === 'cm office') return true
  // HUAMAK (짧은 'huama' 단독 매칭 금지 — 다른 매장명 오탐 방지)
  if (normalized.includes('huamak') || normalized.includes('huamark')) {
    return true
  }
  // SEACON SQUARE
  if (normalized.includes('seacon')) return true
  return false
}

/**
 * POS 현재 매장이 KBank QR(API) 대상인지.
 * storeId / name / label 중 하나라도 매칭되면 true.
 */
export function isKbankQrEnabledForStore(input: {
  storeId?: string | null
  storeName?: string | null
  storeLabel?: string | null
}): boolean {
  const labels = collectNormalizedStoreLabels([input.storeId, input.storeName, input.storeLabel])
  return labels.some(isKbankQrPilotStoreLabel)
}
