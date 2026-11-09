/**
 * Grab 메뉴 알림 409 — 같은 매장 메뉴 동기화가 이미 진행 중이면 새 알림을 거절한다.
 * 품목 PUT(락 약 10초) 직후 알림을 보내면 이 응답이 난다.
 */
export function isGrabMenuNotificationBusyError(error: unknown): boolean {
  const msg = (error instanceof Error ? error.message : String(error ?? '')).toLowerCase()
  if (!msg) return false
  if (/\b409\b/.test(msg)) return true
  return /in progress|conflict|syncing|already/.test(msg) && /menu|sync|notification/.test(msg)
}

export function grabMenuNotificationErrorText(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error ?? '')
  return msg.replace(/\s+/g, ' ').trim().slice(0, 180)
}
