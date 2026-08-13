/**
 * QR 테이블 뷔페 패키지(299/399/499) 입장료 줄.
 * 홀 계산·영수증에는 남기고, 주방으로 보내지 않는다.
 */
export const QR_BUFFET_ENTRY_ID_PREFIX = 'buffet-entry-'

export function isQrBuffetPackageKitchenSkipLine(it: {
  id?: unknown
  isBuffetEntry?: unknown
} | null | undefined): boolean {
  if (!it || typeof it !== 'object') return false
  if (it.isBuffetEntry === true) return true
  const id = String(it.id ?? '').trim().toLowerCase()
  return id.startsWith(QR_BUFFET_ENTRY_ID_PREFIX)
}
