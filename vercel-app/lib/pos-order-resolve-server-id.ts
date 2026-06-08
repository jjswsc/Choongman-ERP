/**
 * 오프라인·큐 주문 → 서버 pos_orders.id 해석 (취소·상태 변경 전)
 */

import type { PosOrder } from '@/lib/api-client'
import type { Order } from '@/lib/pos-types'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { getPosOrdersWithCache } from '@/lib/offline/receipts-offline'
import { isOnline } from '@/lib/offline/network'
import { syncPending } from '@/lib/offline/sync'
import {
  extractPosLocalOrderNo,
  isPosOfflineOnlyOrder,
  posOrderHasServerId,
} from '@/lib/pos-order-server-id'
import {
  findPendingSavePosOrderByLocalOrderNo,
  removeQueuedSavePosOrderByLocalOrderNo,
} from '@/lib/offline/merge-queued-save-pos-order'

export type ResolvePosOrderServerIdResult = {
  serverId: number | null
  /** savePosOrder 큐에만 있고 DB에는 아직 없음 */
  queueOnly: boolean
  localOrderNo: string | null
}

function isClosedPosStatus(status: string): boolean {
  const s = String(status ?? '').trim().toLowerCase()
  return s === 'cancelled' || s === 'canceled' || s === 'refunded' || s === 'completed' || s === 'paid'
}

function orderItemQtySum(order: Pick<Order, 'items'>): number {
  if (!order.items?.length) return 0
  return order.items.reduce((sum, it) => sum + Math.max(0, Number(it.quantity ?? 1) || 1), 0)
}

function posRowItemQtySum(row: PosOrder): number {
  if (!row.items?.length) return 0
  return row.items.reduce((sum, it) => sum + Math.max(0, Number(it.qty ?? 1) || 1), 0)
}

function mapUiOrderTypeToDb(type: Order['type']): string {
  if (type === 'delivery') return 'delivery'
  if (type === 'takeout') return 'takeout'
  return 'dine_in'
}

function scorePosOrderMatch(order: Order, row: PosOrder): number {
  let score = 0
  const uiType = mapUiOrderTypeToDb(order.type)
  const rowType = String(row.dbOrderType ?? row.orderType ?? '').trim().toLowerCase()
  if (rowType === uiType || (uiType === 'dine_in' && rowType === 'dine-in')) score += 4

  const table = String(order.tableName ?? order.customerName ?? '').trim()
  const rowTable = String(row.tableName ?? '').trim()
  if (table && rowTable && table === rowTable) score += 5

  const totalDiff = Math.abs(Number(row.total ?? 0) - Number(order.total ?? 0))
  if (totalDiff < 0.02) score += 4
  else if (totalDiff < 2) score += 2

  const qtyDiff = Math.abs(posRowItemQtySum(row) - orderItemQtySum(order))
  if (qtyDiff === 0) score += 2
  else if (qtyDiff <= 1) score += 1

  return score
}

async function lookupServerOrderIdFromCache(
  order: Order,
  storeCode: string
): Promise<number | null> {
  const sc = String(storeCode ?? '').trim()
  if (!sc) return null
  const businessDate = getPosBusinessDateStr()
  const rows = await getPosOrdersWithCache({
    storeCode: sc,
    startStr: businessDate,
    endStr: businessDate,
    posBizDayScope: true,
    limit: 1000,
  })
  const candidates = rows.filter((row) => {
    if (isClosedPosStatus(String(row.status ?? ''))) return false
    const id = Number(row.id)
    if (!Number.isFinite(id) || id <= 0) return false
    return scorePosOrderMatch(order, row) >= 6
  })
  if (candidates.length === 0) return null
  candidates.sort((a, b) => {
    const scoreDiff = scorePosOrderMatch(order, b) - scorePosOrderMatch(order, a)
    if (scoreDiff !== 0) return scoreDiff
    return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
  })
  const best = Number(candidates[0]?.id)
  return Number.isFinite(best) && best > 0 ? best : null
}

async function trySyncPendingSaveOrders(): Promise<void> {
  if (!isOnline()) return
  try {
    await syncPending({ bypassBackoff: true })
  } catch {
    /* 배너·다음 시도에 맡김 */
  }
}

/**
 * 취소·상태 변경 API 호출 전 서버 id 확보.
 * 큐에만 있으면 queueOnly=true (전체 취소 시 큐에서 제거).
 */
export async function resolvePosOrderServerIdForAction(
  order: Order,
  storeCode: string,
  options?: { trySync?: boolean }
): Promise<ResolvePosOrderServerIdResult> {
  const localOrderNo = extractPosLocalOrderNo(order)
  if (posOrderHasServerId(order.id)) {
    return {
      serverId: Number(order.id),
      queueOnly: false,
      localOrderNo,
    }
  }

  if (options?.trySync !== false) {
    await trySyncPendingSaveOrders()
  }

  if (localOrderNo) {
    const pending = await findPendingSavePosOrderByLocalOrderNo(localOrderNo)
    if (pending) {
      return { serverId: null, queueOnly: true, localOrderNo }
    }
  }

  const lookedUp = await lookupServerOrderIdFromCache(order, storeCode)
  if (lookedUp != null) {
    return { serverId: lookedUp, queueOnly: false, localOrderNo }
  }

  if (isPosOfflineOnlyOrder(order)) {
    return { serverId: null, queueOnly: Boolean(localOrderNo), localOrderNo }
  }

  const n = Number(order.id)
  if (Number.isFinite(n) && n > 0) {
    return { serverId: n, queueOnly: false, localOrderNo }
  }

  return { serverId: null, queueOnly: false, localOrderNo }
}

/** 큐에만 있는 savePosOrder — 서버 반영 전 로컬 취소(큐 항목 제거) */
export async function cancelQueuedOnlyPosOrder(localOrderNo: string): Promise<boolean> {
  return removeQueuedSavePosOrderByLocalOrderNo(localOrderNo)
}
