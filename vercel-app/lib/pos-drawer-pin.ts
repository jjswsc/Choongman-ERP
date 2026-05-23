import type { PosCashDrawerOpenSource } from '@/lib/pos-cash-drawer'

/** 금전 서랍 PIN — 정확히 6자리 숫자 */
export function isValidPosDrawerPin(pin: string): boolean {
  return /^\d{6}$/.test(String(pin ?? '').trim())
}

/**
 * PIN이 설정된 매장에서 돈통 열기 전 직원 PIN 입력이 필요한지.
 * 현금 결제 완료 자동 오픈(`payment_auto`)만 제외 — 결제 중인 캐셔 세션으로 간주.
 */
export function drawerOpenRequiresPin(
  source: PosCashDrawerOpenSource,
  drawerPinConfigured: boolean
): boolean {
  if (!drawerPinConfigured) return false
  if (source === 'payment_auto') return false
  return true
}
