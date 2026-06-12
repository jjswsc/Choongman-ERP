/** 미수금 store_name 비교·그룹 — CM 접두·대소문자 차이 통합 */

export function normalizeReceivableStoreKey(v: string): string {
  const raw = String(v || '').trim().toLowerCase()
  if (!raw) return ''
  const noSpace = raw.replace(/\s+/g, ' ')
  return noSpace.startsWith('cm ') ? noSpace.slice(3).trim() : noSpace
}

export function receivableStoreGroupKey(storeName: string): string {
  const norm = normalizeReceivableStoreKey(storeName)
  return norm || String(storeName || '').trim().toLowerCase()
}

export function pickReceivableDisplayStoreName(current: string, next: string): string {
  const a = String(current || '').trim()
  const b = String(next || '').trim()
  if (!b) return a
  if (!a) return b
  if (a.length !== b.length) return a.length >= b.length ? a : b
  return a.toLowerCase().startsWith('cm ') ? a : b.toLowerCase().startsWith('cm ') ? b : a
}
