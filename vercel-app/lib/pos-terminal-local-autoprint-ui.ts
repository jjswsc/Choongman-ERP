/** POS 터미널 페이지 마운트 시 로컬 주문·주방 인쇄 — layout sync host와 중복 방지 */

import { hasRecentPosAutoPrintKey } from '@/lib/pos-auto-print-dedupe'
import { isPosMainDeviceSyncOwnedByLayout } from '@/lib/pos-main-device-sync-owner'

let terminalLocalAutoprintActive = false
let orderSubmitInFlightUntilMs = 0

export function setPosTerminalLocalAutoprintActive(active: boolean): void {
  terminalLocalAutoprintActive = active
  if (!active) orderSubmitInFlightUntilMs = 0
}

export function isPosTerminalLocalAutoprintActive(): boolean {
  return terminalLocalAutoprintActive
}

/** savePosOrder/updatePosOrder 직전 — Realtime INSERT가 로컬 저장보다 먼저 오는 레이스 완화 */
export function markPosTerminalOrderSubmitInFlight(durationMs = 12_000): void {
  orderSubmitInFlightUntilMs = Date.now() + Math.max(1000, durationMs)
}

export function isPosTerminalOrderSubmitInFlight(): boolean {
  return Date.now() < orderSubmitInFlightUntilMs
}

/**
 * layout sync host — 터미널이 열려 있으면 **이 기기가 방금 저장한** 주문 autoprint는 터미널에 위임.
 * seenOrderIds 는 INSERT/Poll 핸들러가 이미 add한 뒤 호출되므로 항상 true → 원격 주문까지 차단됨.
 * 따라서 submitInFlight / suppressUntilMs 만 본다.
 * createdBy===currentUser 는 쓰면 안 됨: 태블릿·메인이 같은 로그인(manager)이면
 * 원격 홀 영수증까지 건너뛰고 주방 폴백만 나간다.
 */
export function shouldSyncHostSkipLocalKitchenAutoprint(opts: {
  orderId: number
  isApiInboundDelivery?: boolean
  suppressUntilMs?: number | null
}): boolean {
  if (!terminalLocalAutoprintActive) return false
  if (opts.isApiInboundDelivery) return false
  if (isPosTerminalOrderSubmitInFlight()) return true
  if (opts.suppressUntilMs != null && Date.now() < opts.suppressUntilMs) return true
  return false
}

/** 홀 추가주문 meta scan — 레이아웃 호스트가 담당하면 터미널이 열려도 호스트가 스캔 */
export function shouldSyncHostSkipDineInAddonMetaScan(): boolean {
  if (isPosMainDeviceSyncOwnedByLayout()) return false
  return terminalLocalAutoprintActive
}

/** 터미널 submit 후 주방 미출력 시 sync host 폴백(2분 이내·dedupe 없을 때만) */
export function shouldSyncHostKitchenFallbackForTerminalOrder(
  orderId: number,
  storeCode: string,
  kitchenOnOrder: boolean
): boolean {
  if (!kitchenOnOrder) return false
  if (!terminalLocalAutoprintActive) return false
  if (isPosTerminalOrderSubmitInFlight()) return false
  const id = Math.floor(Number(orderId))
  if (!Number.isFinite(id) || id <= 0) return false
  const store = String(storeCode ?? '').trim()
  if (!store) return false
  return !hasRecentPosAutoPrintKey(store, `k2:order:${id}:kitchen`, 120_000)
}
