import type { PosRealtimeSubscribeStatus } from '@/lib/supabase-client'
import type { GrabCancelWatchSnap } from '@/lib/pos-grab-cancel-watch'
import { hasRecentPosAutoPrintKey, posPaymentAutoPrintDedupeKey } from '@/lib/pos-auto-print-dedupe'
import {
  MAIN_POS_STARTUP_CATCHUP_DURATION_MS,
  MAIN_POS_STARTUP_CATCHUP_WINDOW_MS,
  isSessionNewOrder,
  readMainPosLastSeenOrderId,
  writeMainPosLastSeenOrderId,
} from '@/lib/pos-terminal-auto-print'

/** 메인 POS 레이아웃 동기화 — 터미널·전역 호스트 간 공유 ref */
export const seenOrderIdsRef = { current: new Set<number>() }
export const printedPaymentReceiptIdsRef = { current: new Set<number>() }
export const backgroundAcceptedDeliveryOrderIdsRef = { current: new Set<number>() }
export const printedHallDiscountReprintKeysRef = { current: new Set<string>() }
export const pendingEmptyItemsOrderIdsRef = { current: new Set<number>() }
export const dineInRemoteItemQtySnapshotRef = { current: new Map<number, Map<string, number>>() }
export const mainPosSelfDineInUpdateSuppressUntilRef = { current: new Map<number, number>() }
export const grabCancelWatchSnapshotRef = { current: new Map<number, GrabCancelWatchSnap>() }

export const hasInitializedMainPosPollRef = { current: false }
export const lastSeenOrderIdRef = { current: 0 }
export const lastSeenOrderIdPersistedRef = { current: 0 }
export let sessionStartedAt = Date.now()
export const startupCatchupUntilRef = {
  current: Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS,
}
export const prevStoreForPollRef = { current: null as string | null }
export const mainPosPollInFlightRef = { current: false }
export const lastMetaScanAtRef = { current: 0 }
export const lastRealtimeOrderEventAtRef = { current: 0 }
export const realtimeChannelStateRef = { current: new Map<string, PosRealtimeSubscribeStatus>() }
export const realtimeChannelHealthyRef = { current: false }
export const paymentReceiptScanSeededRef = { current: false }
export const grabCancelWatchSeededRef = { current: false }
export const promptedGrabCustomerCancelIdsRef = { current: new Set<number>() }
export const lastTriggerMainPosPollAtRef = { current: 0 }
export const triggerMainPosPollNowRef = { current: null as (() => void) | null }

export function resetPosMainDeviceSyncStateForStore(storeCode: string): void {
  const persistedLastSeen = readMainPosLastSeenOrderId(storeCode)
  hasInitializedMainPosPollRef.current = false
  lastSeenOrderIdRef.current = persistedLastSeen
  lastSeenOrderIdPersistedRef.current = persistedLastSeen
  startupCatchupUntilRef.current = Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS
  prevStoreForPollRef.current = storeCode
  grabCancelWatchSnapshotRef.current.clear()
  grabCancelWatchSeededRef.current = false
  lastMetaScanAtRef.current = 0
  printedHallDiscountReprintKeysRef.current.clear()
  paymentReceiptScanSeededRef.current = false
}

export function clearPosMainDeviceSyncStateOnNonMain(): void {
  hasInitializedMainPosPollRef.current = false
  lastSeenOrderIdRef.current = 0
  lastSeenOrderIdPersistedRef.current = 0
  startupCatchupUntilRef.current = Date.now() + MAIN_POS_STARTUP_CATCHUP_DURATION_MS
  prevStoreForPollRef.current = null
  lastMetaScanAtRef.current = 0
  triggerMainPosPollNowRef.current = null
}

export function bumpLastSeenOrderId(storeCode: string | null | undefined, orderIdRaw: unknown): void {
  const orderId = Number(orderIdRaw)
  if (!Number.isFinite(orderId) || orderId <= 0) return
  const next = Math.trunc(orderId)
  if (next > lastSeenOrderIdRef.current) {
    lastSeenOrderIdRef.current = next
  }
  if (next > lastSeenOrderIdPersistedRef.current) {
    lastSeenOrderIdPersistedRef.current = next
  }
  const code = String(storeCode ?? '').trim()
  if (code) {
    writeMainPosLastSeenOrderId(code, next)
  }
}

export function resetPosMainDeviceSessionStartedAt(): void {
  sessionStartedAt = Date.now()
}

/**
 * 결제 영수증 자동 인쇄 큐 — Realtime·폴링 경합 시 1회만 허용.
 * localStorage dedupe에 이미 있으면 ref만 채우고 false.
 */
export function claimMainPosPaymentReceiptAutoprint(orderIdRaw: unknown, storeCode: string): boolean {
  const orderId = Math.floor(Number(orderIdRaw))
  if (!Number.isFinite(orderId) || orderId <= 0) return false
  if (printedPaymentReceiptIdsRef.current.has(orderId)) return false
  const store = String(storeCode ?? '').trim()
  const dedupeKey = posPaymentAutoPrintDedupeKey(orderId)
  if (store && hasRecentPosAutoPrintKey(store, dedupeKey)) {
    printedPaymentReceiptIdsRef.current.add(orderId)
    return false
  }
  printedPaymentReceiptIdsRef.current.add(orderId)
  return true
}

/** Realtime·폴링·배달 UI — hook·터미널 공통 “신규 유입” 판정 (catchup 포함) */
export function shouldTreatAsMainPosIncomingOrder(orderIdRaw: unknown, createdAtRaw: unknown): boolean {
  const orderId = Number(orderIdRaw)
  if (!Number.isFinite(orderId) || orderId <= 0) return false
  if (isSessionNewOrder(createdAtRaw, sessionStartedAt)) return true
  if (Date.now() > startupCatchupUntilRef.current) return false
  if (orderId <= lastSeenOrderIdPersistedRef.current) return false
  const createdAtMs = new Date(String(createdAtRaw ?? '').trim()).getTime()
  if (!Number.isFinite(createdAtMs)) return true
  return createdAtMs >= sessionStartedAt - MAIN_POS_STARTUP_CATCHUP_WINDOW_MS
}
