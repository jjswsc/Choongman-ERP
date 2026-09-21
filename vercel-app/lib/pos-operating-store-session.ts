/**
 * POS 화면 간 운영 매장 — 영업 시작에서 고른 매장(1001)을 Order 게이트가 그대로 쓰게 한다.
 */

const STORAGE_KEY = 'cm_pos_operating_store_v1'

export function writePosOperatingStore(storeCode: string): void {
  if (typeof sessionStorage === 'undefined') return
  const t = String(storeCode || '').trim()
  if (!t) return
  try {
    sessionStorage.setItem(STORAGE_KEY, t)
  } catch {
    /* quota / private mode */
  }
}

export function readPosOperatingStore(): string {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    return String(sessionStorage.getItem(STORAGE_KEY) || '').trim()
  } catch {
    return ''
  }
}
