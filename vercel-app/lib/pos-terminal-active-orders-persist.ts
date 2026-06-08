/**
 * 터미널 진행 중 주문 — sessionStorage (페이지 이동·refetch 실패 시에도 결제까지 유지)
 */

import type { Order } from '@/lib/pos-types'
import { settlementStoreCacheKeys } from '@/lib/offline/settlement-offline'
import { normStoreKey } from '@/lib/store-list-keys'

const STORAGE_PREFIX = 'cm_pos_terminal_active_v1'

export function isActiveTerminalListOrder(order: Order | undefined | null): boolean {
  if (!order) return false
  const st = String(order.status ?? 'pending').toLowerCase()
  return !['cancelled', 'canceled', 'refunded', 'completed', 'paid'].includes(st)
}

function storageKeys(storeCode: string, businessDateYmd: string): string[] {
  const date = String(businessDateYmd || '').trim().slice(0, 10)
  if (!date) return []
  const keys = new Set<string>()
  for (const sc of settlementStoreCacheKeys(storeCode)) {
    keys.add(`${STORAGE_PREFIX}:${normStoreKey(sc)}:${date}`)
  }
  const trimmed = String(storeCode || '').trim()
  if (trimmed) keys.add(`${STORAGE_PREFIX}:${normStoreKey(trimmed)}:${date}`)
  return Array.from(keys)
}

type SerializedOrder = Omit<Order, 'createdAt'> & { createdAt: string }

function serializeOrder(order: Order): SerializedOrder {
  const createdAt =
    order.createdAt instanceof Date
      ? order.createdAt.toISOString()
      : new Date(order.createdAt || Date.now()).toISOString()
  return { ...order, createdAt }
}

function deserializeOrder(row: SerializedOrder): Order {
  const d = new Date(row.createdAt)
  return {
    ...row,
    createdAt: Number.isNaN(d.getTime()) ? new Date() : d,
  }
}

export function loadPersistedActiveTerminalOrders(
  storeCode: string,
  businessDateYmd: string
): Order[] {
  if (typeof sessionStorage === 'undefined') return []
  const keys = storageKeys(storeCode, businessDateYmd)
  for (const key of keys) {
    try {
      const raw = sessionStorage.getItem(key)
      if (!raw) continue
      const parsed = JSON.parse(raw) as SerializedOrder[]
      if (!Array.isArray(parsed)) continue
      return parsed.map(deserializeOrder).filter(isActiveTerminalListOrder)
    } catch {
      /* next key */
    }
  }
  return []
}

export function persistActiveTerminalOrders(
  storeCode: string,
  businessDateYmd: string,
  orders: Order[]
): void {
  if (typeof sessionStorage === 'undefined') return
  const keys = storageKeys(storeCode, businessDateYmd)
  if (keys.length === 0) return
  const active = orders.filter(isActiveTerminalListOrder).map(serializeOrder)
  try {
    if (active.length === 0) {
      for (const key of keys) sessionStorage.removeItem(key)
      return
    }
    const payload = JSON.stringify(active)
    for (const key of keys) sessionStorage.setItem(key, payload)
  } catch {
    /* quota */
  }
}

export function orderListMergeKey(order: Order): string {
  const id = String(order.id ?? '').trim()
  const no = String(order.orderNo ?? '').trim()
  if (id) return `id:${id}`
  if (no) return `no:${no}`
  return ''
}

/** in-memory prev + sessionStorage 스냅샷 합치기 */
export function combineOrdersForTerminalMerge(
  storeCode: string,
  businessDateYmd: string,
  prevOrders: Order[]
): Order[] {
  const persisted = loadPersistedActiveTerminalOrders(storeCode, businessDateYmd)
  const byKey = new Map<string, Order>()
  for (const row of [...persisted, ...prevOrders]) {
    if (!isActiveTerminalListOrder(row)) continue
    const key = orderListMergeKey(row)
    if (!key) continue
    byKey.set(key, row)
  }
  return Array.from(byKey.values())
}
