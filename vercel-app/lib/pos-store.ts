'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Store, Table, Order, OrderItem } from '@/lib/pos-types'
import { useStoreList } from '@/lib/use-store-list'
import { useAuth } from '@/lib/auth-context'
import { isOfficeRole } from '@/lib/permissions'
import {
  getPosTableLayout,
  type PosFloorLabels,
  type PosTableItem,
  type PosOrder,
  type PosOrderItem,
} from '@/lib/api-client'
import { normalizePosFloorLabels } from '@/lib/pos-table-layout-payload'
import type { PosAppliedCouponLine } from '@/lib/pos-coupon-domain'
import { getPosOrdersWithCache } from '@/lib/offline/receipts-offline'
import { shouldPreferOfflineCache } from '@/lib/offline/network'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { normalizePosTableNameForMatch } from '@/lib/pos-print-translate'
import {
  parsePosTableFloorFromLabel,
  posDineInTableLabelsMatch,
  posDineInTableMatchKey,
  resolveDineInOrderForLayoutTable,
  type PosDineInTableRef,
  type PosTableFloor,
} from '@/lib/pos-table-floor-match'
import { isDineInOrderForTableDisplay } from '@/lib/pos-sales-order-type-filter'
import {
  isMemberPortalTakeoutKitchenOpen,
  resolveMemberPortalTakeoutTableDisplay,
} from '@/lib/pos-member-portal-takeout-label'
import { mergeOrderUiItemsPreserveLineState, resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'
import {
  combineOrdersForTerminalMerge,
  isActiveTerminalListOrder,
  orderListMergeKey,
  persistActiveTerminalOrders,
  loadPersistedActiveTerminalOrders,
} from '@/lib/pos-terminal-active-orders-persist'
import {
  dropStaleOfflineOrdersWhenServerHasMatch,
  shouldKeepPrevOrderMissingFromFetched,
} from '@/lib/pos-order-local-reconcile'
import { isPosOfflineOnlyOrder } from '@/lib/pos-order-server-id'
import { roundMemberPointsEarn } from '@/lib/member-points-math'

/** 관리자 테이블 배치와 동일한 픽셀 그리드 (pos-table-layout-content 기준) */
const GRID_SIZE = 24
const FLOOR_W = 720
const FLOOR_H = 480
const DEFAULT_GRID_COLS = Math.round(FLOOR_W / GRID_SIZE)
const DEFAULT_GRID_ROWS = Math.round(FLOOR_H / GRID_SIZE)

function mapOrderType(orderType: string): Order['type'] {
  const v = String(orderType || '').trim().toLowerCase()
  if (v === 'delivery') return 'delivery'
  if (v === 'takeout') return 'takeout'
  return 'dine-in'
}

function inferOrderType(po: PosOrder & { orderNo?: string }): Order['type'] {
  const explicit = mapOrderType(po.orderType)
  if (explicit !== 'dine-in') return explicit

  const memo = String(po.memo ?? '').toLowerCase()
  const tableName = String(po.tableName ?? '').toLowerCase()
  const paymentChannel = String(po.deliveryPaymentChannel ?? '').trim().toLowerCase()
  const hasDeliveryItem = Array.isArray(po.items)
    ? po.items.some((it) => String(it.deliveryAppCode ?? '').trim() !== '')
    : false

  // 실데이터에서 order_type이 비표준값으로 저장되는 경우를 위한 보강 분류.
  if (
    paymentChannel === 'grab' ||
    paymentChannel === 'lineman' ||
    paymentChannel === 'shopee' ||
    memo.includes('grab_order:') ||
    memo.includes('lineman_order:') ||
    memo.includes('shopee_order:') ||
    memo.includes('delivery') ||
    tableName.includes('grab') ||
    tableName.includes('line man') ||
    tableName.includes('lineman') ||
    tableName.includes('shopee') ||
    hasDeliveryItem
  ) {
    return 'delivery'
  }
  return 'dine-in'
}

function mapOrderStatus(status: string): Order['status'] {
  const v = String(status || '').toLowerCase()
  if (v === 'completed' || v === 'done') return 'completed'
  if (v === 'cancelled' || v === 'canceled') return 'cancelled'
  if (v === 'paid') return 'paid'
  if (v === 'ready') return 'ready'
  if (v === 'pending') return 'pending'
  return 'preparing'
}

function normalizePosOrderItemsForUi(rows: PosOrderItem[]): Order['items'] {
  const merged = new Map<
    string,
    {
      id: string
      name: string
      quantity: number
      price: number
      menuId?: string
      menuId1?: string
      menuId2?: string
      optionId?: string
      optionId1?: string
      optionId2?: string
      optionCode?: string
      optionCode1?: string
      optionCode2?: string
      note?: string
      servedAt?: string | null
      servedBy?: string | null
      cancelledAt?: string | null
      cancelledBy?: string | null
      cancelReason?: string | null
      promoId?: string
      promoCode?: string
      promoItems?: { menuId: string; optionId: string | null; quantity: number }[]
      setChildrenState?: Record<
        string,
        {
          servedAt?: string | null
          servedBy?: string | null
          packedAt?: string | null
          packedBy?: string | null
        }
      >
      deliveryAppCode?: string
    }
  >()

  for (let i = 0; i < rows.length; i += 1) {
    const it = rows[i] as PosOrderItem
    const menuId1 = String(it.menuId1 ?? '').trim()
    const menuId2 = String(it.menuId2 ?? '').trim()
    const parentMenuId = String(it.menuId ?? '').trim()
    const optionId1 = String(it.optionId1 ?? '').trim()
    const optionId2 = String(it.optionId2 ?? '').trim()
    const optionCode1 = String(it.optionCode1 ?? '').trim()
    const optionCode2 = String(it.optionCode2 ?? '').trim()
    const note = typeof it.note === 'string' && String(it.note).trim() ? String(it.note).trim() : ''
    const promoId = String(it.promoId ?? '').trim()
    const promoCode = String(it.promoCode ?? '').trim()
    const deliveryAppCode = String(it.deliveryAppCode ?? '').trim()
    const promoItems =
      Array.isArray(it.promoItems) && it.promoItems.length > 0 ? it.promoItems : undefined
    const setChildrenState =
      it.setChildrenState && typeof it.setChildrenState === 'object' && !Array.isArray(it.setChildrenState)
        ? (it.setChildrenState as Record<string, { servedAt?: string | null; servedBy?: string | null; packedAt?: string | null; packedBy?: string | null }>)
        : undefined
    const qty = resolveItemsJsonLineQty(it)
    const price = Number(it.price ?? 0) || 0
    const idRaw = String(it.id ?? '').trim()
    const name = String(it.name ?? '')
    const dedupeKey = JSON.stringify([
      idRaw,
      name,
      price,
      note,
      parentMenuId || menuId1 || menuId2,
      menuId1 || menuId2,
      optionId1 || optionId2,
      promoId,
      promoCode,
      JSON.stringify(promoItems ?? []),
      JSON.stringify(setChildrenState ?? {}),
      deliveryAppCode,
      String(it.servedAt ?? ''),
      String(it.cancelledAt ?? ''),
    ])
    const mergedPrev = merged.get(dedupeKey)
    if (mergedPrev) {
      mergedPrev.quantity += qty
      continue
    }
    const safeId = idRaw || `line-${i}`
    const resolvedMenuId =
      parentMenuId ||
      (menuId1 && menuId2 && menuId1 !== menuId2 ? '' : menuId1 || menuId2)
    merged.set(dedupeKey, {
      id: safeId,
      name,
      quantity: qty,
      price,
      ...(resolvedMenuId ? { menuId: resolvedMenuId } : {}),
      ...(menuId1 ? { menuId1 } : {}),
      ...(menuId2 ? { menuId2 } : {}),
      ...(optionId1 ? { optionId1 } : {}),
      ...(optionId2 ? { optionId2 } : {}),
      ...(optionId1 || optionId2 ? { optionId: optionId1 || optionId2 } : {}),
      ...(optionCode1 ? { optionCode1 } : {}),
      ...(optionCode2 ? { optionCode2 } : {}),
      ...(optionCode1 || optionCode2 ? { optionCode: optionCode1 || optionCode2 } : {}),
      ...(note ? { note } : {}),
      servedAt: typeof it.servedAt === 'string' ? it.servedAt : null,
      servedBy: typeof it.servedBy === 'string' ? it.servedBy : null,
      cancelledAt: typeof it.cancelledAt === 'string' ? it.cancelledAt : null,
      cancelledBy: typeof it.cancelledBy === 'string' ? it.cancelledBy : null,
      cancelReason: typeof it.cancelReason === 'string' ? it.cancelReason : null,
      ...(promoId ? { promoId, ...(promoCode ? { promoCode } : {}) } : {}),
      ...(promoItems ? { promoItems } : {}),
      ...(setChildrenState ? { setChildrenState } : {}),
      ...(deliveryAppCode ? { deliveryAppCode } : {}),
    })
  }
  return Array.from(merged.values())
}

function posOrderToOrder(po: PosOrder & { orderNo?: string }): Order {
  const inferredType = inferOrderType(po)
  const tableDisplay =
    inferredType === 'takeout'
      ? resolveMemberPortalTakeoutTableDisplay({
          tableName: po.tableName,
          memo: po.memo,
          memberId: po.memberId,
          memberNo: po.memberNo,
        })
      : String(po.tableName || '').trim()
  return {
    id: String(po.id),
    tableId: undefined,
    type: inferredType,
    items: normalizePosOrderItemsForUi(po.items || []),
    total: Number(po.total ?? 0) || 0,
    status: mapOrderStatus(po.status),
    createdAt: new Date(po.createdAt || Date.now()),
    paidAt: String(po.paidAt ?? '').trim() || undefined,
    updatedAt: String(po.updatedAt ?? '').trim() || undefined,
    tableName: tableDisplay || undefined,
    customerName: tableDisplay || undefined,
    memo: String(po.memo || '').trim() || undefined,
    orderNo: String(po.orderNo ?? '').trim() || undefined,
    deliveryAppCode: (() => {
      const c = String(po.deliveryAppCode ?? '').trim()
      return c || undefined
    })(),
    guestCount:
      inferredType === 'dine-in'
        ? Math.max(0, Math.min(99, Math.trunc(Number(po.guestCount ?? 0) || 0)))
        : undefined,
    discountAmt: Math.max(0, Number(po.discountAmt ?? 0) || 0),
    discountReason: String(po.discountReason ?? '').trim() || undefined,
    paymentCash: Math.max(0, Number(po.paymentCash ?? 0) || 0),
    ...(Math.max(0, Number(po.paymentCashTendered ?? 0) || 0) > 0.005
      ? { paymentCashTendered: Math.max(0, Number(po.paymentCashTendered ?? 0) || 0) }
      : {}),
    paymentCard: Math.max(0, Number(po.paymentCard ?? 0) || 0),
    paymentQr: Math.max(0, Number(po.paymentQr ?? 0) || 0),
    paymentOther: Math.max(0, Number(po.paymentOther ?? 0) || 0),
    paymentDeliveryApp: Math.max(0, Number(po.paymentDeliveryApp ?? 0) || 0),
    deliveryPaymentChannel: String(po.deliveryPaymentChannel ?? '').trim() || undefined,
    memberId: Math.max(0, Math.trunc(Number(po.memberId ?? 0) || 0)) || undefined,
    memberNo: String(po.memberNo ?? '').trim() || undefined,
    couponCode: String(po.couponCode ?? '').trim().toUpperCase() || undefined,
    couponDiscountAmt: Math.max(0, Number(po.couponDiscountAmt ?? 0) || 0),
    appliedCoupons: Array.isArray((po as { appliedCoupons?: unknown }).appliedCoupons)
      ? ((po as { appliedCoupons: PosAppliedCouponLine[] }).appliedCoupons)
      : undefined,
    pointUsed: roundMemberPointsEarn(po.pointUsed) || undefined,
    pointEarned: roundMemberPointsEarn(po.pointEarned) || undefined,
  }
}

function layoutItemToTableRef(t: PosTableItem): PosDineInTableRef {
  const floor = Math.min(3, Math.max(1, Number(t.floor ?? 1) || 1)) as PosTableFloor
  return {
    id: String(t.id ?? ''),
    name: String(t.name ?? '').trim() || String(t.id ?? ''),
    floor,
  }
}

function posOrderMergeKey(po: PosOrder): string {
  const id = String(po.id ?? '').trim()
  if (id) return `id:${id}`
  const no = String(po.orderNo ?? '').trim()
  if (no) return `no:${no}`
  return ''
}

function layoutToTables(
  layout: PosTableItem[],
  dineInOrders: PosOrder[]
): Table[] {
  const layoutPeers = (layout || []).map(layoutItemToTableRef)
  const assignedOrderKeys = new Set<string>()
  return (layout || []).map((t) => {
    const gridX = Math.round((t.x ?? 0) / GRID_SIZE)
    const gridY = Math.round((t.y ?? 0) / GRID_SIZE)
    const gridW = Math.max(1, Math.round((t.w ?? 80) / GRID_SIZE))
    const gridH = Math.max(1, Math.round((t.h ?? 60) / GRID_SIZE))
    const shape = String(t.shape ?? 'rect')
    const shapeMap =
      shape === 'square'
        ? 'square'
        : shape === 'round'
          ? 'round'
          : 'rectangle'
    const name = String(t.name ?? '').trim() || String(t.id ?? '')
    const tableRef = layoutItemToTableRef(t)
    const candidates = dineInOrders.filter(
      (o) =>
        posDineInTableLabelsMatch(String(o.tableName ?? ''), tableRef, { layoutPeers }) &&
        (() => {
          const k = posOrderMergeKey(o)
          return !k || !assignedOrderKeys.has(k)
        })()
    )
    let posOrder: PosOrder | undefined
    if (candidates.length > 0) {
      posOrder = resolveDineInOrderForLayoutTable(tableRef, candidates, layoutPeers)
      const k = posOrder ? posOrderMergeKey(posOrder) : ''
      if (k) assignedOrderKeys.add(k)
    }
    const order = posOrder ? posOrderToOrder(posOrder) : undefined
    const floor = tableRef.floor
    return {
      id: String(t.id ?? ''),
      name,
      floor,
      seats: Number(t.seats ?? 0) || 0,
      x: Math.max(0, gridX),
      y: Math.max(0, gridY),
      width: gridW,
      height: gridH,
      shape: shapeMap as Table['shape'],
      rotation: Number(t.rotation ?? 0) || 0,
      isOccupied: !!order,
      order,
    }
  })
}

type StoreSnapshot = {
  storeCode: string
  store: Store
  layout: PosTableItem[]
  floorLabels: PosFloorLabels
  activeOrders: PosOrder[]
}

type RefetchStoresOptions = {
  scope?: 'all' | 'current'
  storeCode?: string
  /** true: 헤더 새로고침 등 사용자가 즉시 반영을 기대할 때(디바운스 생략) */
  immediate?: boolean
  /** true: 사용자 수동 새로고침 — 레이아웃 API 재조회 + IndexedDB 캐시 갱신 (backgroundRefresh 무시) */
  forceFullRefresh?: boolean
}

type OptimisticOrderInput = {
  storeCode: string
  /** DB pos_orders.id — 있으면 배달/포장 바·목록 id와 일치 */
  serverOrderId?: number
  orderNo?: string
  orderType?: string
  tableName?: string
  /** 다층 매장: `table_name`에 층 접두가 없을 때 낙관적 병합·중복 제거용 */
  tableLayoutFloor?: number
  memo?: string
  status?: Order['status']
  createdAt?: Date | number
  total?: number
  items: Array<{
    id?: string
    name?: string
    quantity?: number
    qty?: number
    price?: number
    menuId?: string
    optionId?: string
    note?: string
    servedAt?: string | null
    servedBy?: string | null
    cancelledAt?: string | null
    cancelledBy?: string | null
    cancelReason?: string | null
    setChildrenState?: OrderItem['setChildrenState']
  }>
}

function isLocalOfflineOrder(order: Order | undefined | null): boolean {
  if (!order) return false
  return isPosOfflineOnlyOrder(order)
}

function isPendingListSyncOrder(order: Order | undefined | null): boolean {
  return Boolean(order?.pendingListSync)
}

function orderLineQtySum(order: Order | undefined | null): number {
  if (!order?.items?.length) return 0
  return order.items.reduce(
    (sum, it) => sum + Math.max(0, Number(it.quantity ?? 1) || 1),
    0
  )
}

function orderItemsSubtotal(order: Order | undefined | null): number {
  if (!order?.items?.length) return 0
  return order.items.reduce(
    (sum, it) =>
      sum + (Number(it.price ?? 0) || 0) * Math.max(0, Number(it.quantity ?? 1) || 1),
    0
  )
}

/** 추가 주문 직후 refetch가 DB보다 먼저 도착할 때 낙관적 스냅샷을 덮어쓰지 않음 */
function shouldPreferPrevOrderSnapshot(prev: Order, next: Order): boolean {
  if (isLocalOfflineOrder(prev)) return true
  if (!isPendingListSyncOrder(prev)) return false
  const prevQty = orderLineQtySum(prev)
  const nextQty = orderLineQtySum(next)
  const prevSub = orderItemsSubtotal(prev)
  const nextSub = orderItemsSubtotal(next)
  return prevQty > nextQty || prevSub > nextSub + 0.01
}

function mergeFetchedOrderWithPendingLocal(fetched: Order, pending: Order): Order {
  const mergedItems = mergeOrderUiItemsPreserveLineState(
    Array.isArray(pending.items) ? pending.items : [],
    Array.isArray(fetched.items) ? fetched.items : []
  )
  return {
    ...pending,
    items: mergedItems.length > 0 ? mergedItems : pending.items,
    status: fetched.status,
    total: Math.max(Number(pending.total ?? 0) || 0, Number(fetched.total ?? 0) || 0),
    pendingListSync: true,
  }
}

function mergeFetchedOrdersWithLocal(fetched: Order[], prev: Order[]): Order[] {
  const prevClean = dropStaleOfflineOrdersWhenServerHasMatch(fetched, prev)
  const pendingByKey = new Map<string, Order>()
  for (const row of prevClean) {
    if (!isLocalOfflineOrder(row) && !isPendingListSyncOrder(row)) continue
    const key = orderListMergeKey(row)
    if (key) pendingByKey.set(key, row)
  }
  const out: Order[] = []
  const seen = new Set<string>()
  for (const row of fetched) {
    const key = orderListMergeKey(row)
    const pending = key ? pendingByKey.get(key) : undefined
    if (pending && shouldPreferPrevOrderSnapshot(pending, row)) {
      out.push(mergeFetchedOrderWithPendingLocal(row, pending))
      if (key) {
        seen.add(key)
        pendingByKey.delete(key)
      }
      continue
    }
    out.push(row)
    if (key) {
      seen.add(key)
      pendingByKey.delete(key)
    }
  }
  for (const row of pendingByKey.values()) {
    const key = orderListMergeKey(row)
    if (!key || seen.has(key)) continue
    out.unshift(row)
    seen.add(key)
  }
  /** pollMinimal·캐시 지연 refetch가 방금 저장한 주문을 빼먹을 때 — in-memory 스냅샷 유지 */
  for (const row of prevClean) {
    if (!shouldKeepPrevOrderMissingFromFetched(row)) continue
    const key = orderListMergeKey(row)
    if (!key || seen.has(key)) continue
    out.unshift(row)
    seen.add(key)
  }
  return out
}

function findPrevTableForMerge(tbl: Table, prevStore: Store): Table | undefined {
  const tblFloor = Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) as PosTableFloor
  const tblNorm = normalizePosTableNameForMatch(tbl.name)
  return prevStore.tables.find((pt) => {
    if (pt.id === tbl.id) return true
    const ptFloor = Math.min(3, Math.max(1, Number(pt.floor ?? 1) || 1)) as PosTableFloor
    if (ptFloor !== tblFloor) return false
    return tblNorm ? normalizePosTableNameForMatch(pt.name) === tblNorm : false
  })
}

function mergeStoreTablesWithLocalOrders(
  nextStore: Store,
  prevStore?: Store,
  activeOrders?: Order[]
): Store {
  if (!prevStore) return nextStore
  const activeOrderKeys = activeOrderKeySet(activeOrders)
  const layoutPeers: PosDineInTableRef[] = nextStore.tables.map((pt) => ({
    id: pt.id,
    name: pt.name,
    floor: Math.min(3, Math.max(1, Number(pt.floor ?? 1) || 1)) as PosTableFloor,
  }))
  const nextTables = nextStore.tables.map((tbl) => {
    const prevTable = findPrevTableForMerge(tbl, prevStore)
    const prevOrder = prevTable?.order
    const nextOrder = tbl.order
    if (prevOrder && nextOrder && shouldPreferPrevOrderSnapshot(prevOrder, nextOrder)) {
      return {
        ...tbl,
        order: mergeFetchedOrderWithPendingLocal(nextOrder, prevOrder),
        isOccupied: true,
      }
    }
    if (tbl.order) return tbl
    if (!prevOrder) return tbl
    if (isLocalOfflineOrder(prevOrder) || isPendingListSyncOrder(prevOrder)) {
      return { ...tbl, order: prevOrder, isOccupied: true }
    }
    const prevKey = orderListMergeKey(prevOrder)
    /** 진행 중 목록이 비었을 때도 구 스냅샷 테이블 주문을 지움(결제·퇴장 후 관리자 새로고침 잔존 방지) */
    if (prevKey && !activeOrderKeys.has(prevKey)) {
      return tbl
    }
    /** 테이블 이동: 서버는 새 테이블에만 붙였는데 prev 스냅샷이 구 테이블에 남는 경우 */
    if (prevKey && activeOrders?.length) {
      const fetched = activeOrders.find((o) => orderListMergeKey(o) === prevKey)
      if (fetched?.type === 'dine-in' && String(fetched.tableName ?? '').trim()) {
        const floor = Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) as PosTableFloor
        const ref = { id: tbl.id, name: tbl.name, floor }
        if (!posDineInTableLabelsMatch(String(fetched.tableName ?? ''), ref, { layoutPeers })) {
          return tbl
        }
      }
    }
    if (!isActiveTerminalListOrder(prevOrder)) return tbl
    return { ...tbl, order: prevOrder, isOccupied: true }
  })
  return { ...nextStore, tables: nextTables }
}

/** 배달·포장 목록(ordersByStoreId)의 홀 주문을 테이블 order에 다시 연결 */
function hydrateStoreTablesFromActiveOrders(store: Store, orders: Order[]): Store {
  const dineInActive = orders.filter(
    (o) => o.type === 'dine-in' && isActiveTerminalListOrder(o) && String(o.tableName ?? '').trim()
  )
  if (dineInActive.length === 0) return store
  const peers: PosDineInTableRef[] = store.tables.map((pt) => ({
    id: pt.id,
    name: pt.name,
    floor: Math.min(3, Math.max(1, Number(pt.floor ?? 1) || 1)) as PosTableFloor,
  }))
  const assignedKeys = new Set<string>()
  for (const tbl of store.tables) {
    if (!tbl.order || !isActiveTerminalListOrder(tbl.order)) continue
    const k = orderListMergeKey(tbl.order)
    if (k) assignedKeys.add(k)
  }
  return {
    ...store,
    tables: store.tables.map((tbl) => {
      if (tbl.order && isActiveTerminalListOrder(tbl.order)) return { ...tbl, isOccupied: true }
      const floor = Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) as PosTableFloor
      const ref = { id: tbl.id, name: tbl.name, floor }
      const matched = dineInActive.find((o) => {
        const k = orderListMergeKey(o)
        if (k && assignedKeys.has(k)) return false
        return posDineInTableLabelsMatch(String(o.tableName ?? ''), ref, { layoutPeers: peers })
      })
      if (matched) {
        const k = orderListMergeKey(matched)
        if (k) assignedKeys.add(k)
        return { ...tbl, order: matched, isOccupied: true }
      }
      return tbl
    }),
  }
}

function activeOrderKeySet(orders: Order[] | undefined): Set<string> {
  const keys = new Set<string>()
  for (const row of orders || []) {
    if (!isActiveTerminalListOrder(row)) continue
    const k = orderListMergeKey(row)
    if (k) keys.add(k)
  }
  return keys
}

function withPersistedTerminalOrders(
  storeCode: string,
  businessDateYmd: string,
  fetched: Order[],
  prevOrders: Order[]
): Order[] {
  const merged = mergeFetchedOrdersWithLocal(
    fetched,
    combineOrdersForTerminalMerge(storeCode, businessDateYmd, prevOrders)
  )
  persistActiveTerminalOrders(storeCode, businessDateYmd, merged)
  return merged
}

function withPosSnapshotTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => {
      window.setTimeout(() => resolve(fallback), ms)
    }),
  ])
}

export function usePosStoreStandalone() {
  return usePosStoreInternal({ initialLoadScope: 'all' })
}

export type PosStoreInitialLoadScope = 'all' | 'current'

function resolvePosStoreBootstrapCodes(
  effectiveStoreCodes: string[],
  opts: {
    initialLoadScope: PosStoreInitialLoadScope
    canSearchAll: boolean
    canonicalAuthStore: string
  }
): string[] {
  if (!effectiveStoreCodes.length) return []
  if (opts.initialLoadScope === 'current' && opts.canSearchAll) {
    const pick =
      (opts.canonicalAuthStore && effectiveStoreCodes.includes(opts.canonicalAuthStore)
        ? opts.canonicalAuthStore
        : effectiveStoreCodes[0]) || ''
    return pick ? [pick] : effectiveStoreCodes
  }
  return effectiveStoreCodes
}

export function usePosStoreInternal(options?: { initialLoadScope?: PosStoreInitialLoadScope }) {
  const initialLoadScope = options?.initialLoadScope ?? 'all'
  const { posStores: storeCodes, legacyToCanonical, loading: storeListLoading } = useStoreList()
  const { auth } = useAuth()
  const canSearchAll = isOfficeRole(auth?.role || '')
  const canonicalAuthStore = useMemo(() => {
    const raw = String(auth?.store || '').trim()
    if (!raw) return ''
    const key = raw.toLowerCase()
    const canonical = String(legacyToCanonical[key] || '').trim()
    if (canonical) return canonical
    if (storeCodes.includes(raw)) return raw
    return raw
  }, [auth?.store, legacyToCanonical, storeCodes])
  const effectiveStoreCodes = useMemo(() => {
    let codes: string[]
    if (canSearchAll) {
      if (storeCodes.length > 0) codes = storeCodes
      else if (canonicalAuthStore) codes = [canonicalAuthStore]
      else codes = storeCodes
      return codes
    }
    codes = canonicalAuthStore ? [canonicalAuthStore] : storeCodes
    return codes
  }, [canSearchAll, canonicalAuthStore, storeCodes])

  const [stores, setStores] = useState<Store[]>([])
  const [layoutByStoreId, setLayoutByStoreId] = useState<Record<string, PosTableItem[]>>({})
  const layoutByStoreIdRef = useRef<Record<string, PosTableItem[]>>({})
  const [floorLabelsByStoreId, setFloorLabelsByStoreId] = useState<Record<string, PosFloorLabels>>({})
  const floorLabelsByStoreIdRef = useRef<Record<string, PosFloorLabels>>({})
  const [currentStoreId, setCurrentStoreId] = useState<string>(() =>
    String(canonicalAuthStore || '').trim()
  )
  const [ordersByStoreId, setOrdersByStoreId] = useState<Record<string, Order[]>>({})
  const ordersByStoreIdRef = useRef<Record<string, Order[]>>({})
  const [loading, setLoading] = useState(true)
  const loadedPosStoreIdsRef = useRef<Set<string>>(new Set())

  useEffect(() => {
    layoutByStoreIdRef.current = layoutByStoreId
  }, [layoutByStoreId])
  useEffect(() => {
    floorLabelsByStoreIdRef.current = floorLabelsByStoreId
  }, [floorLabelsByStoreId])

  useEffect(() => {
    ordersByStoreIdRef.current = ordersByStoreId
  }, [ordersByStoreId])

  /** auth 매장이 생기면 부트스트랩 전에도 currentStoreId를 채워 /pos 튕김 레이스를 줄임 */
  useEffect(() => {
    const code = String(canonicalAuthStore || '').trim()
    if (!code) return
    setCurrentStoreId((prev) => (prev ? prev : code))
  }, [canonicalAuthStore])

  /** API 대기 전 sessionStorage 진행 중 주문 즉시 표시 (새로고침·재진입) */
  useEffect(() => {
    if (!effectiveStoreCodes.length) return
    const businessDate = getPosBusinessDateStr()
    const seeded: Record<string, Order[]> = {}
    for (const code of effectiveStoreCodes) {
      const rows = loadPersistedActiveTerminalOrders(code, businessDate)
      if (rows.length > 0) seeded[code] = rows
    }
    if (Object.keys(seeded).length === 0) return
    setOrdersByStoreId((prev) => {
      const next = { ...prev }
      let changed = false
      for (const [code, rows] of Object.entries(seeded)) {
        if ((next[code]?.length ?? 0) > 0) continue
        next[code] = rows
        changed = true
      }
      if (!changed) return prev
      ordersByStoreIdRef.current = next
      return next
    })
    setStores((prev) => {
      if (prev.length === 0) return prev
      return prev.map((store) =>
        hydrateStoreTablesFromActiveOrders(store, seeded[store.id] ?? ordersByStoreIdRef.current[store.id] ?? [])
      )
    })
  }, [effectiveStoreCodes.join(',')])

  const fetchStoreSnapshot = useCallback(
    async (
      storeCode: string,
      businessDate: string,
      options?: { layoutFromCacheOnly?: boolean; skipPollMinimalCache?: boolean }
    ): Promise<StoreSnapshot> => {
      const primary = String(storeCode || '').trim()
      /** 수동 새로고침(skipPollMinimalCache)은 빈 배열 타임아웃 폴백 금지 — 느린망에서 홀/배달이 안 바뀐 것처럼 보임 */
      const awaitFullNetwork = Boolean(options?.skipPollMinimalCache)
      const snapshotTimeoutMs = shouldPreferOfflineCache()
        ? 2800
        : awaitFullNetwork
          ? 45_000
          : 12_000
      const cachedLayoutFallback = layoutByStoreIdRef.current[storeCode] || []
      const cachedFloorLabelsFallback = floorLabelsByStoreIdRef.current[storeCode] || {}
      const layoutFetch =
        options?.layoutFromCacheOnly && cachedLayoutFallback.length > 0
          ? Promise.resolve({
              layout: cachedLayoutFallback,
              floorLabels: cachedFloorLabelsFallback,
              storeCode: primary,
            })
          : getPosTableLayout({ storeCode: primary }).catch(() => ({
              layout: cachedLayoutFallback,
              floorLabels: cachedFloorLabelsFallback,
              storeCode: primary,
            }))
      const layoutPromise = awaitFullNetwork
        ? layoutFetch
        : withPosSnapshotTimeout(layoutFetch, snapshotTimeoutMs, {
            layout: cachedLayoutFallback,
            floorLabels: cachedFloorLabelsFallback,
            storeCode: primary,
          })
      const ordersFetch = getPosOrdersWithCache({
        storeCode: primary,
        startStr: businessDate,
        endStr: businessDate,
        posBizDayScope: true,
        pollMinimal: true,
        limit: 1000,
        skipPollMinimalCache: Boolean(options?.skipPollMinimalCache),
      }).catch(() => [] as PosOrder[])
      const ordersPromise = awaitFullNetwork
        ? ordersFetch
        : withPosSnapshotTimeout(ordersFetch, snapshotTimeoutMs, [] as PosOrder[])
      const [layoutRes, ordersRes] = await Promise.all([layoutPromise, ordersPromise])
      const fetchedLayout = layoutRes.layout || []
      const cachedLayout = layoutByStoreIdRef.current[storeCode] || []
      const layout = fetchedLayout.length > 0 ? fetchedLayout : cachedLayout
      const floorLabels =
        fetchedLayout.length > 0
          ? normalizePosFloorLabels(layoutRes.floorLabels ?? {})
          : floorLabelsByStoreIdRef.current[storeCode] ||
            normalizePosFloorLabels(layoutRes.floorLabels ?? {})
      const activeOrders = (ordersRes || []).filter(
        (o) => !['cancelled', 'refunded'].includes((o.status ?? '').toLowerCase())
      )
      const dineInOrders = activeOrders.filter(
        (o) =>
          isDineInOrderForTableDisplay(o.orderType, o.dbOrderType) &&
          (o.tableName ?? '').trim() !== '' &&
          // paid는 확정 매출 — 테이블에 남기면 실시간「테이블 총액」과 홀이 이중으로 잡힘. ready(서빙완료·미결제)는 좌석 표시용으로 유지.
          !['cancelled', 'refunded', 'completed', 'paid'].includes((o.status ?? '').toLowerCase())
      )
      const tables = layoutToTables(layout, dineInOrders)
      return {
        storeCode,
        store: {
          id: storeCode,
          name: storeCode,
          gridCols: DEFAULT_GRID_COLS,
          gridRows: DEFAULT_GRID_ROWS,
          tables,
        },
        layout,
        floorLabels,
        activeOrders,
      }
    },
    []
  )

  // API에서 테이블 배치 + 당일 매장 주문으로 사용 중 테이블 반영
  useEffect(() => {
    if (storeListLoading && effectiveStoreCodes.length === 0) {
      setLoading(true)
      return
    }
    if (!effectiveStoreCodes?.length) {
      /**
       * 목록이 잠깐 비는 레이스에서 stores를 비우고 loading=false 하면
       * 터미널이 직원 홈(/pos)으로 튕긴다. auth 매장이 있으면 유지.
       */
      if (canonicalAuthStore) {
        setLoading(true)
        return
      }
      setStores([])
      setLoading(false)
      return
    }
    setLoading(true)
    const businessDate = getPosBusinessDateStr()
    const bootstrapStoreCodes = resolvePosStoreBootstrapCodes(effectiveStoreCodes, {
      initialLoadScope,
      canSearchAll,
      canonicalAuthStore,
    })
    Promise.all(bootstrapStoreCodes.map((storeCode) => fetchStoreSnapshot(storeCode, businessDate)))
      .then((results) => {
        for (const r of results) loadedPosStoreIdsRef.current.add(r.storeCode)
        const storeList = results.map((r) => r.store)
        const layouts: Record<string, PosTableItem[]> = {}
        const floorLabelsMap: Record<string, PosFloorLabels> = {}
        const nextOrdersByStore: Record<string, Order[]> = {}
        results.forEach((r) => {
          layouts[r.storeCode] = r.layout
          floorLabelsMap[r.storeCode] = r.floorLabels
        })
        results.forEach((r) => {
          nextOrdersByStore[r.storeCode] = (r.activeOrders || []).map(posOrderToOrder)
        })
        const mergedOrdersByStore: Record<string, Order[]> = {}
        const orderSeedCodes =
          initialLoadScope === 'current' && canSearchAll ? bootstrapStoreCodes : effectiveStoreCodes
        for (const code of orderSeedCodes) {
          mergedOrdersByStore[code] = withPersistedTerminalOrders(
            code,
            businessDate,
            nextOrdersByStore[code] ?? [],
            []
          )
        }
        ordersByStoreIdRef.current = mergedOrdersByStore
        setStores((prev) =>
          storeList.map((nextStore) => {
            const orders = mergedOrdersByStore[nextStore.id] ?? []
            const merged = mergeStoreTablesWithLocalOrders(
              nextStore,
              prev.find((p) => p.id === nextStore.id),
              orders
            )
            return hydrateStoreTablesFromActiveOrders(merged, orders)
          })
        )
        setLayoutByStoreId(layouts)
        setFloorLabelsByStoreId(floorLabelsMap)
        setOrdersByStoreId(mergedOrdersByStore)
        setCurrentStoreId((prev) => {
          const bootstrapDefault = storeList[0]?.id ?? ''
          const next =
            canonicalAuthStore && effectiveStoreCodes.includes(canonicalAuthStore)
              ? canonicalAuthStore
              : effectiveStoreCodes[0]
          const preferred =
            bootstrapDefault && effectiveStoreCodes.includes(bootstrapDefault)
              ? bootstrapDefault
              : next ?? effectiveStoreCodes[0] ?? ''
          return storeList.some((s) => s.id === prev) ? prev : preferred
        })
      })
      .catch(() => {
        const businessDate = getPosBusinessDateStr()
        const fallbackOrders: Record<string, Order[]> = {}
        for (const code of bootstrapStoreCodes) {
          fallbackOrders[code] = loadPersistedActiveTerminalOrders(code, businessDate)
        }
        ordersByStoreIdRef.current = fallbackOrders
        setOrdersByStoreId(fallbackOrders)
        setStores((prev) => {
          if (prev.length > 0) {
            return prev.map((store) =>
              hydrateStoreTablesFromActiveOrders(store, fallbackOrders[store.id] ?? [])
            )
          }
          return bootstrapStoreCodes.map((code) => {
            const layout = layoutByStoreIdRef.current[code] ?? []
            const base: Store = {
              id: code,
              name: code,
              gridCols: DEFAULT_GRID_COLS,
              gridRows: DEFAULT_GRID_ROWS,
              tables: layoutToTables(layout, []),
            }
            return hydrateStoreTablesFromActiveOrders(base, fallbackOrders[code] ?? [])
          })
        })
        setCurrentStoreId((prev) => {
          if (prev && bootstrapStoreCodes.includes(prev)) return prev
          if (canonicalAuthStore && bootstrapStoreCodes.includes(canonicalAuthStore)) {
            return canonicalAuthStore
          }
          return bootstrapStoreCodes[0] ?? effectiveStoreCodes[0] ?? ''
        })
      })
      .finally(() => setLoading(false))
  }, [effectiveStoreCodes.join(','), canonicalAuthStore, fetchStoreSnapshot, storeListLoading, initialLoadScope, canSearchAll])

  // effectiveStoreCodes 변경 시 currentStoreId가 목록에 없으면 첫 매장으로
  useEffect(() => {
    if (!effectiveStoreCodes.length || !currentStoreId) return
    if (effectiveStoreCodes.includes(currentStoreId)) return
    setCurrentStoreId(
      canonicalAuthStore && effectiveStoreCodes.includes(canonicalAuthStore)
        ? canonicalAuthStore
        : effectiveStoreCodes[0]
    )
  }, [effectiveStoreCodes, currentStoreId, canonicalAuthStore])

  const currentStore = stores.find((s) => s.id === currentStoreId) || stores[0]

  const setCurrentStoreIdAndPersist = useCallback((id: string) => {
    setCurrentStoreId(id)
  }, [])

  const updateStore = useCallback((storeId: string, updates: Partial<Store>) => {
    setStores((prev) =>
      prev.map((store) => (store.id === storeId ? { ...store, ...updates } : store))
    )
  }, [])

  const updateTable = useCallback((storeId: string, tableId: string, updates: Partial<Table>) => {
    setStores((prev) =>
      prev.map((store) =>
        store.id === storeId
          ? {
              ...store,
              tables: store.tables.map((table) =>
                table.id === tableId ? { ...table, ...updates } : table
              ),
            }
          : store
      )
    )
  }, [])

  const addTable = useCallback((storeId: string, table: Table) => {
    setStores((prev) =>
      prev.map((store) =>
        store.id === storeId ? { ...store, tables: [...store.tables, table] } : store
      )
    )
  }, [])

  const removeTable = useCallback((storeId: string, tableId: string) => {
    setStores((prev) =>
      prev.map((store) =>
        store.id === storeId
          ? { ...store, tables: store.tables.filter((t) => t.id !== tableId) }
          : store
      )
    )
  }, [])

  const clearTables = useCallback((storeId: string) => {
    setStores((prev) =>
      prev.map((store) => (store.id === storeId ? { ...store, tables: [] } : store))
    )
  }, [])

  /** 결제 완료 시 테이블 주문 즉시 제거 (낙관적 업데이트) */
  const clearTableOrder = useCallback((storeId: string, tableName: string) => {
    const name = String(tableName ?? '').trim()
    if (!name) return
    setStores((prev) =>
      prev.map((store) => {
        if (store.id !== storeId) return store
        const peers: PosDineInTableRef[] = store.tables.map((pt) => ({
          id: pt.id,
          name: pt.name,
          floor: Math.min(3, Math.max(1, Number(pt.floor ?? 1) || 1)) as PosTableFloor,
        }))
        return {
          ...store,
          tables: store.tables.map((t) => {
            const floor = Math.min(3, Math.max(1, Number(t.floor ?? 1) || 1)) as PosTableFloor
            const match = posDineInTableLabelsMatch(name, { id: t.id, name: t.name, floor }, { layoutPeers: peers })
            return match ? { ...t, order: undefined, isOccupied: false } : t
          }),
        }
      })
    )
  }, [])

  const refetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refetchStoresImmediate = useCallback(async (options?: RefetchStoresOptions) => {
    if (!effectiveStoreCodes?.length) return Promise.resolve()
    const requestedStore = String(options?.storeCode ?? '').trim()
    const targetStoreCodes =
      requestedStore && effectiveStoreCodes.includes(requestedStore)
        ? [requestedStore]
        : options?.scope === 'current' && currentStoreId && effectiveStoreCodes.includes(currentStoreId)
          ? [currentStoreId]
          : effectiveStoreCodes
    if (!targetStoreCodes.length) return Promise.resolve()
    /** 이미 스냅샷이 있으면 로딩으로 화면을 비우지 않음(실시간 매출 검색 대기 체감 완화) */
    const backgroundRefresh =
      !options?.forceFullRefresh &&
      options?.scope === 'current' && stores.length > 0 && targetStoreCodes.length > 0
    if (stores.length === 0) {
      setLoading(true)
    }
    const businessDate = getPosBusinessDateStr()
    return Promise.all(
      targetStoreCodes.map((storeCode) =>
        fetchStoreSnapshot(storeCode, businessDate, {
          layoutFromCacheOnly: backgroundRefresh,
          skipPollMinimalCache: !backgroundRefresh,
        })
      )
    )
      .then((results) => {
        for (const code of targetStoreCodes) loadedPosStoreIdsRef.current.add(code)
        const resultStoreMap = new Map(results.map((r) => [r.storeCode, r.store]))
        const resultLayoutMap = new Map(results.map((r) => [r.storeCode, r.layout]))
        const resultFloorLabelsMap = new Map(results.map((r) => [r.storeCode, r.floorLabels]))
        const resultOrdersMap = new Map(results.map((r) => [r.storeCode, (r.activeOrders || []).map(posOrderToOrder)]))

        const prevOrders = ordersByStoreIdRef.current
        const nextOrdersByStore: Record<string, Order[]> = { ...prevOrders }
        for (const code of targetStoreCodes) {
          nextOrdersByStore[code] = withPersistedTerminalOrders(
            code,
            businessDate,
            resultOrdersMap.get(code) ?? [],
            prevOrders[code] ?? []
          )
        }
        ordersByStoreIdRef.current = nextOrdersByStore

        setStores((prev) => {
          const hydrate = (store: Store) =>
            hydrateStoreTablesFromActiveOrders(store, nextOrdersByStore[store.id] ?? [])
          if (targetStoreCodes.length === effectiveStoreCodes.length) {
            return effectiveStoreCodes
              .map((code) => {
                const next = resultStoreMap.get(code)
                if (!next) return null
                const orders = nextOrdersByStore[code] ?? []
                return hydrate(
                  mergeStoreTablesWithLocalOrders(
                    next,
                    prev.find((p) => p.id === code),
                    orders
                  )
                )
              })
              .filter(Boolean) as Store[]
          }
          return prev.map((store) => {
            const next = resultStoreMap.get(store.id)
            const orders = nextOrdersByStore[store.id] ?? []
            if (!next) return hydrate(store)
            return hydrate(
              mergeStoreTablesWithLocalOrders(next, store, orders)
            )
          })
        })
        setLayoutByStoreId((prev) => {
          const next = { ...prev }
          for (const code of targetStoreCodes) {
            next[code] = resultLayoutMap.get(code) ?? []
          }
          return next
        })
        setFloorLabelsByStoreId((prev) => {
          const next = { ...prev }
          for (const code of targetStoreCodes) {
            next[code] = resultFloorLabelsMap.get(code) ?? {}
          }
          return next
        })
        setOrdersByStoreId(nextOrdersByStore)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [effectiveStoreCodes.join(','), currentStoreId, fetchStoreSnapshot, stores.length])

  /** refetchStores 디바운스 (600ms) - 연속 호출 시 API 부하 감소. `immediate`면 즉시 실행하고 Promise 반환 */
  const refetchStores = useCallback((options?: RefetchStoresOptions) => {
    const immediate = Boolean(options?.immediate)
    const pass: RefetchStoresOptions = {
      scope: options?.scope,
      storeCode: options?.storeCode,
      forceFullRefresh: options?.forceFullRefresh,
    }
    if (immediate) {
      return refetchStoresImmediate(pass)
    }
    if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current)
    refetchTimeoutRef.current = setTimeout(() => {
      refetchTimeoutRef.current = null
      void refetchStoresImmediate(pass)
    }, 600)
  }, [refetchStoresImmediate])

  /** POS(/pos/*): 본사 계정은 현재 매장만 먼저 로드 — 매장 전환 시 lazy fetch */
  useEffect(() => {
    if (initialLoadScope !== 'current' || !canSearchAll) return
    if (loading) return
    const storeCode = String(currentStoreId || '').trim()
    if (!storeCode || !effectiveStoreCodes.includes(storeCode)) return
    if (loadedPosStoreIdsRef.current.has(storeCode)) return
    void refetchStoresImmediate({ scope: 'current', storeCode })
  }, [
    initialLoadScope,
    canSearchAll,
    currentStoreId,
    effectiveStoreCodes.join(','),
    loading,
    refetchStoresImmediate,
  ])

  const orders = useMemo(() => Object.values(ordersByStoreId).flat(), [ordersByStoreId])
  const currentStoreOrders = useMemo(() => {
    if (currentStoreId && Array.isArray(ordersByStoreId[currentStoreId])) {
      return ordersByStoreId[currentStoreId]
    }
    return orders
  }, [ordersByStoreId, currentStoreId, orders])

  const isOpenChannelOrder = (o: Order) => {
    const st = String(o.status ?? '').trim().toLowerCase()
    return (
      st !== 'ready' &&
      st !== 'completed' &&
      st !== 'paid' &&
      st !== 'cancelled' &&
      st !== 'canceled' &&
      st !== 'refunded'
    )
  }
  const deliveryOrders = currentStoreOrders.filter((o) => o.type === 'delivery' && isOpenChannelOrder(o))
  const packagedDeliveryOrders = currentStoreOrders.filter(
    (o) => o.type === 'delivery' && o.status === 'ready'
  )
  const completedDeliveryOrders = currentStoreOrders.filter(
    (o) => o.type === 'delivery' && (o.status === 'completed' || o.status === 'paid')
  )
  const isOpenTakeoutOrder = (o: Order) =>
    o.type === 'takeout' && (isOpenChannelOrder(o) || isMemberPortalTakeoutKitchenOpen(o))
  const takeoutOrders = currentStoreOrders.filter(isOpenTakeoutOrder)
  const packagedTakeoutOrders = currentStoreOrders.filter(
    (o) => o.type === 'takeout' && o.status === 'ready'
  )
  const completedTakeoutOrders = currentStoreOrders.filter((o) => {
    if (o.type !== 'takeout') return false
    if (isMemberPortalTakeoutKitchenOpen(o)) return false
    const st = String(o.status ?? '').trim().toLowerCase()
    return st === 'completed' || st === 'paid'
  })

  const updateOrderStatus = useCallback((orderId: string, status: Order['status']) => {
    const businessDate = getPosBusinessDateStr()
    setOrdersByStoreId((prev) => {
      const next: Record<string, Order[]> = {}
      Object.entries(prev).forEach(([storeCode, list]) => {
        next[storeCode] = list.map((order) => (order.id === orderId ? { ...order, status } : order))
        persistActiveTerminalOrders(storeCode, businessDate, next[storeCode])
      })
      ordersByStoreIdRef.current = next
      return next
    })
  }, [])

  /** getPosOrders 단건 조회 후 터미널 스냅샷에 병합(품목 누락·목록 미동기화 보강) */
  const upsertOrderFromServer = useCallback((po: PosOrder & { orderNo?: string }) => {
    const storeCode = String(po.storeCode ?? '').trim()
    if (!storeCode) return
    const order = posOrderToOrder(po)
    const id = String(order.id ?? '').trim()
    if (!id) return
    const businessDate = getPosBusinessDateStr()
    setOrdersByStoreId((prev) => {
      const list = Array.isArray(prev[storeCode]) ? [...prev[storeCode]] : []
      const idx = list.findIndex((row) => String(row.id ?? '').trim() === id)
      const next = [...list]
      if (idx >= 0) next[idx] = { ...next[idx], ...order }
      else next.unshift(order)
      const merged = { ...prev, [storeCode]: next }
      persistActiveTerminalOrders(storeCode, businessDate, next)
      ordersByStoreIdRef.current = merged
      return merged
    })
  }, [])

  /** QR Cancel 등: 결제 tender만 로컬에서 즉시 0으로 (Pay 버튼 재활성) */
  const clearTerminalOrderPaymentTenders = useCallback((storeCode: string, orderId: number | string) => {
    const code = String(storeCode || '').trim()
    const id = String(orderId ?? '').trim()
    if (!code || !id) return
    const businessDate = getPosBusinessDateStr()
    setOrdersByStoreId((prev) => {
      const list = Array.isArray(prev[code]) ? [...prev[code]] : []
      const idx = list.findIndex((row) => String(row.id ?? '').trim() === id)
      if (idx < 0) return prev
      const next = [...list]
      next[idx] = {
        ...next[idx],
        paymentCash: 0,
        paymentCashTendered: undefined,
        paymentCard: 0,
        paymentQr: 0,
        paymentOther: 0,
        paymentDeliveryApp: 0,
      }
      const merged = { ...prev, [code]: next }
      persistActiveTerminalOrders(code, businessDate, next)
      ordersByStoreIdRef.current = merged
      return merged
    })
  }, [])

  const upsertOptimisticOrder = useCallback((input: OptimisticOrderInput) => {
    const storeCode = String(input.storeCode || '').trim()
    if (!storeCode) return
    const type = mapOrderType(input.orderType || '')
    const tableName = String(input.tableName || '').trim()
    const status = input.status ?? 'pending'
    const createdAt =
      input.createdAt instanceof Date
        ? input.createdAt
        : new Date(
            typeof input.createdAt === 'number' && Number.isFinite(input.createdAt)
              ? input.createdAt
              : Date.now()
          )
    const safeItems = (Array.isArray(input.items) ? input.items : []).map((it, idx) => {
      const qty = Math.max(1, Number(it.quantity ?? it.qty ?? 1) || 1)
      const price = Number(it.price ?? 0) || 0
      const id = String(it.id ?? '').trim() || `local-line-${idx + 1}`
      return {
        id,
        name: String(it.name ?? '').trim() || id,
        quantity: qty,
        price,
        ...(String(it.menuId ?? '').trim() ? { menuId: String(it.menuId).trim() } : {}),
        ...(String(it.optionId ?? '').trim() ? { optionId: String(it.optionId).trim() } : {}),
        ...(String(it.note ?? '').trim() ? { note: String(it.note).trim() } : {}),
        ...(String(it.servedAt ?? '').trim() ? { servedAt: String(it.servedAt) } : {}),
        ...(String(it.servedBy ?? '').trim() ? { servedBy: String(it.servedBy) } : {}),
        ...(String(it.cancelledAt ?? '').trim() ? { cancelledAt: String(it.cancelledAt) } : {}),
        ...(String(it.cancelledBy ?? '').trim() ? { cancelledBy: String(it.cancelledBy) } : {}),
        ...(String(it.cancelReason ?? '').trim() ? { cancelReason: String(it.cancelReason) } : {}),
        ...(it.setChildrenState ? { setChildrenState: it.setChildrenState } : {}),
      }
    })
    if (safeItems.length === 0) return
    const orderNo = String(input.orderNo || '').trim()
    const sumTotal = safeItems.reduce((acc, it) => acc + Number(it.price || 0) * Number(it.quantity || 1), 0)
    const total = Number(input.total ?? sumTotal) || 0
    const serverOrderId = Number(input.serverOrderId ?? 0)
    const hasServerId = Number.isFinite(serverOrderId) && serverOrderId > 0
    const orderId = hasServerId
      ? String(serverOrderId)
      : orderNo || `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    const optimistic: Order = {
      id: orderId,
      type,
      items: safeItems,
      total,
      status,
      createdAt,
      ...(tableName ? { tableName, customerName: tableName } : {}),
      ...(String(input.memo || '').trim() ? { memo: String(input.memo).trim() } : {}),
      ...(orderNo ? { orderNo } : {}),
      ...(hasServerId ? { pendingListSync: true } : {}),
    }

    setOrdersByStoreId((prev) => {
      const list = Array.isArray(prev[storeCode]) ? [...prev[storeCode]] : []
      const next = list.filter((o) => {
        if (hasServerId && String(o.id ?? '').trim() === String(serverOrderId)) return false
        if (orderNo && String(o.orderNo ?? '').trim() === orderNo) return false
        if (!orderNo && tableName && type === 'dine-in') {
          const floor = Math.min(
            3,
            Math.max(
              1,
              Number(
                parsePosTableFloorFromLabel(tableName) ??
                  input.tableLayoutFloor ??
                  1
              ) || 1
            )
          )
          const k1 = posDineInTableMatchKey(String(o.tableName ?? ''), floor)
          const k2 = posDineInTableMatchKey(tableName, floor)
          if (k1 && k2 && k1 === k2 && o.type === 'dine-in') return false
        }
        return true
      })
      next.unshift(optimistic)
      const merged = { ...prev, [storeCode]: next }
      persistActiveTerminalOrders(storeCode, getPosBusinessDateStr(), next)
      ordersByStoreIdRef.current = merged
      return merged
    })

    if (type === 'dine-in' && tableName) {
      setStores((prev) =>
        prev.map((store) => {
          if (store.id !== storeCode) return store
          const peers: PosDineInTableRef[] = store.tables.map((pt) => ({
            id: pt.id,
            name: pt.name,
            floor: Math.min(3, Math.max(1, Number(pt.floor ?? 1) || 1)) as PosTableFloor,
          }))
          return {
            ...store,
            tables: store.tables.map((tbl) => {
              const floor = Math.min(3, Math.max(1, Number(tbl.floor ?? 1) || 1)) as PosTableFloor
              const matched = posDineInTableLabelsMatch(
                tableName,
                { id: tbl.id, name: tbl.name, floor },
                { layoutPeers: peers }
              )
              return matched
                ? {
                    ...tbl,
                    order: {
                      ...optimistic,
                      items: mergeOrderUiItemsPreserveLineState(
                        optimistic.items,
                        Array.isArray(tbl.order?.items) ? tbl.order.items : []
                      ),
                    },
                    isOccupied: true,
                  }
                : tbl
            }),
          }
        })
      )
    }
  }, [])

  const removeTerminalOrder = useCallback(
    (storeCode: string, order: Pick<Order, 'id' | 'orderNo' | 'tableName'>) => {
      const sc = String(storeCode ?? '').trim()
      if (!sc) return
      const businessDate = getPosBusinessDateStr()
      const targetId = String(order.id ?? '').trim()
      const targetNo = String(order.orderNo ?? '').trim()
      const matches = (row: Order) => {
        const id = String(row.id ?? '').trim()
        const no = String(row.orderNo ?? '').trim()
        if (targetId && id === targetId) return true
        if (targetNo && no === targetNo) return true
        return false
      }
      setOrdersByStoreId((prev) => {
        const list = prev[sc] ?? []
        const nextList = list.filter((row) => !matches(row))
        const next = { ...prev, [sc]: nextList }
        ordersByStoreIdRef.current = next
        persistActiveTerminalOrders(sc, businessDate, nextList)
        return next
      })
      const tableName = String(order.tableName ?? '').trim()
      if (tableName) clearTableOrder(sc, tableName)
    },
    [clearTableOrder]
  )

  const currentLayout = (currentStoreId && layoutByStoreId[currentStoreId]) || []
  const currentFloorLabels =
    (currentStoreId && floorLabelsByStoreId[currentStoreId]) || ({} as PosFloorLabels)

  return {
    stores,
    currentStore,
    currentStoreId,
    currentLayout,
    currentFloorLabels,
    setCurrentStoreId: setCurrentStoreIdAndPersist,
    updateStore,
    updateTable,
    addTable,
    removeTable,
    clearTables,
    clearTableOrder,
    removeTerminalOrder,
    orders,
    deliveryOrders,
    packagedDeliveryOrders,
    completedDeliveryOrders,
    takeoutOrders,
    packagedTakeoutOrders,
    completedTakeoutOrders,
    updateOrderStatus,
    upsertOptimisticOrder,
    upsertOrderFromServer,
    clearTerminalOrderPaymentTenders,
    loadingTables: loading,
    refetchStores,
  }
}
