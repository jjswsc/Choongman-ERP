/** POS 터미널 페이지 마운트 시 로컬 주문·주방 인쇄 — layout sync host와 중복 방지 */

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

/** layout sync host — 터미널이 열려 있으면 로컬(같은 기기) 제출 주문 autoprint는 터미널에 위임 */
export function shouldSyncHostSkipLocalKitchenAutoprint(opts: {
  orderId: number
  createdBy?: string | null
  currentUser?: string | null
  isApiInboundDelivery?: boolean
  seenOrderIds: ReadonlySet<number>
  suppressUntilMs?: number | null
}): boolean {
  if (!terminalLocalAutoprintActive) return false
  if (opts.isApiInboundDelivery) return false
  if (isPosTerminalOrderSubmitInFlight()) return true
  if (opts.seenOrderIds.has(opts.orderId)) return true
  if (opts.suppressUntilMs != null && Date.now() < opts.suppressUntilMs) return true
  const createdBy = String(opts.createdBy ?? '').trim()
  const currentUser = String(opts.currentUser ?? '').trim()
  if (createdBy && currentUser && createdBy === currentUser) return true
  return false
}

/** 홀 추가주문 meta scan — 터미널이 열려 있으면 터미널 submit 경로만 사용 */
export function shouldSyncHostSkipDineInAddonMetaScan(): boolean {
  return terminalLocalAutoprintActive
}
