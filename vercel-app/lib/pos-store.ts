'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Store, Table, Order } from '@/lib/pos-types'
import { useStoreList } from '@/lib/use-store-list'
import { useAuth } from '@/lib/auth-context'
import { isOfficeRole } from '@/lib/permissions'
import {
  getPosTableLayout,
  getGrabStoreIntegrations,
  type GrabStoreIntegrationSnapshot,
  type PosTableItem,
  type PosOrder,
  type PosOrderItem,
} from '@/lib/api-client'
import { getPosOrdersWithCache } from '@/lib/offline/receipts-offline'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { normalizePosTableNameForMatch } from '@/lib/pos-print-translate'
import { resolveItemsJsonLineQty } from '@/lib/pos-order-item-map'

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
      optionId?: string
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
    const optionId1 = String(it.optionId1 ?? '').trim()
    const optionId2 = String(it.optionId2 ?? '').trim()
    const note = typeof it.note === 'string' && String(it.note).trim() ? String(it.note).trim() : ''
    const promoId = String(it.promoId ?? '').trim()
    const promoCode = String(it.promoCode ?? '').trim()
    const deliveryAppCode = String(it.deliveryAppCode ?? '').trim()
    const promoItems =
      promoId && Array.isArray(it.promoItems) && it.promoItems.length > 0 ? it.promoItems : undefined
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
    merged.set(dedupeKey, {
      id: safeId,
      name,
      quantity: qty,
      price,
      ...(menuId1 || menuId2 ? { menuId: menuId1 || menuId2 } : {}),
      ...(optionId1 || optionId2 ? { optionId: optionId1 || optionId2 } : {}),
      ...(note ? { note } : {}),
      servedAt: typeof it.servedAt === 'string' ? it.servedAt : null,
      servedBy: typeof it.servedBy === 'string' ? it.servedBy : null,
      cancelledAt: typeof it.cancelledAt === 'string' ? it.cancelledAt : null,
      cancelledBy: typeof it.cancelledBy === 'string' ? it.cancelledBy : null,
      cancelReason: typeof it.cancelReason === 'string' ? it.cancelReason : null,
      ...(promoId
        ? {
            promoId,
            ...(promoCode ? { promoCode } : {}),
            ...(promoItems ? { promoItems } : {}),
            ...(setChildrenState ? { setChildrenState } : {}),
          }
        : {}),
      ...(deliveryAppCode ? { deliveryAppCode } : {}),
    })
  }
  return Array.from(merged.values())
}

function posOrderToOrder(po: PosOrder & { orderNo?: string }): Order {
  const inferredType = inferOrderType(po)
  return {
    id: String(po.id),
    tableId: undefined,
    type: inferredType,
    items: normalizePosOrderItemsForUi(po.items || []),
    total: Number(po.total ?? 0) || 0,
    status: mapOrderStatus(po.status),
    createdAt: new Date(po.createdAt || Date.now()),
    tableName: String(po.tableName || '').trim() || undefined,
    customerName: String(po.tableName || '').trim() || undefined,
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
    paymentCard: Math.max(0, Number(po.paymentCard ?? 0) || 0),
    paymentQr: Math.max(0, Number(po.paymentQr ?? 0) || 0),
    paymentOther: Math.max(0, Number(po.paymentOther ?? 0) || 0),
    paymentDeliveryApp: Math.max(0, Number(po.paymentDeliveryApp ?? 0) || 0),
    deliveryPaymentChannel: String(po.deliveryPaymentChannel ?? '').trim() || undefined,
    memberId: Math.max(0, Math.trunc(Number(po.memberId ?? 0) || 0)) || undefined,
    memberNo: String(po.memberNo ?? '').trim() || undefined,
    couponCode: String(po.couponCode ?? '').trim().toUpperCase() || undefined,
    couponDiscountAmt: Math.max(0, Number(po.couponDiscountAmt ?? 0) || 0),
    pointUsed: Math.max(0, Math.trunc(Number(po.pointUsed ?? 0) || 0)) || undefined,
    pointEarned: Math.max(0, Math.trunc(Number(po.pointEarned ?? 0) || 0)) || undefined,
  }
}

function layoutToTables(
  layout: PosTableItem[],
  dineInOrders: PosOrder[]
): Table[] {
  const orderByTable = new Map<string, PosOrder>()
  for (const o of dineInOrders) {
    const raw = String(o.tableName ?? '').trim()
    if (!raw) continue
    const keys = new Set<string>()
    keys.add(raw)
    const norm = normalizePosTableNameForMatch(raw)
    if (norm) keys.add(norm)
    for (const key of keys) {
      const existing = orderByTable.get(key)
      if (!existing || new Date(o.createdAt || 0) > new Date(existing.createdAt || 0)) {
        orderByTable.set(key, o)
      }
    }
  }
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
    const idStr = String(t.id ?? '')
    const nameNorm = normalizePosTableNameForMatch(name)
    const idNorm = normalizePosTableNameForMatch(idStr)
    const posOrder =
      orderByTable.get(name) ??
      orderByTable.get(idStr) ??
      (nameNorm ? orderByTable.get(nameNorm) : undefined) ??
      (idNorm ? orderByTable.get(idNorm) : undefined)
    const order = posOrder ? posOrderToOrder(posOrder) : undefined
    return {
      id: String(t.id ?? ''),
      name,
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
  activeOrders: PosOrder[]
}

type RefetchStoresOptions = {
  scope?: 'all' | 'current'
  storeCode?: string
}

export function usePosStore() {
  const { stores: storeCodes, legacyToCanonical } = useStoreList()
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
    if (canSearchAll) {
      if (storeCodes.length > 0) return storeCodes
      if (canonicalAuthStore) return [canonicalAuthStore]
      return storeCodes
    }
    return canonicalAuthStore ? [canonicalAuthStore] : storeCodes
  }, [canSearchAll, canonicalAuthStore, storeCodes])

  const [stores, setStores] = useState<Store[]>([])
  const [layoutByStoreId, setLayoutByStoreId] = useState<Record<string, PosTableItem[]>>({})
  const layoutByStoreIdRef = useRef<Record<string, PosTableItem[]>>({})
  const [currentStoreId, setCurrentStoreId] = useState<string>('')
  const [ordersByStoreId, setOrdersByStoreId] = useState<Record<string, Order[]>>({})
  const [grabIntegrations, setGrabIntegrations] = useState<GrabStoreIntegrationSnapshot[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    layoutByStoreIdRef.current = layoutByStoreId
  }, [layoutByStoreId])

  useEffect(() => {
    let cancelled = false
    getGrabStoreIntegrations({ status: 'ACTIVE', limit: 500 })
      .then((rows) => {
        if (cancelled) return
        setGrabIntegrations(Array.isArray(rows) ? rows : [])
      })
      .catch(() => {
        if (cancelled) return
        setGrabIntegrations([])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const fetchStoreSnapshot = useCallback(async (storeCode: string, businessDate: string): Promise<StoreSnapshot> => {
    const candidates = new Set<string>()
    const primary = String(storeCode || '').trim()
    if (primary) candidates.add(primary)
    const directCanonical = String(legacyToCanonical[primary.toLowerCase()] || '').trim()
    if (directCanonical) candidates.add(directCanonical)
    for (const [legacyRaw, canonicalRaw] of Object.entries(legacyToCanonical || {})) {
      const legacy = String(legacyRaw || '').trim()
      const canonical = String(canonicalRaw || '').trim()
      if (!legacy || !canonical) continue
      if (canonical.toLowerCase() === primary.toLowerCase()) candidates.add(legacy)
    }
    const storeCandidates = Array.from(candidates).filter(Boolean)
    const currentVariantKeys = new Set(storeCandidates.map((c) => String(c).trim().toLowerCase()).filter(Boolean))
    for (const row of grabIntegrations || []) {
      const status = String(row.integrationStatus || '').trim().toLowerCase()
      if (status && status !== 'active') continue
      const partner = String(row.partnerMerchantID || '').trim()
      const grab = String(row.grabMerchantID || '').trim()
      if (!partner || !grab) continue
      const partnerKey = partner.toLowerCase()
      const grabKey = grab.toLowerCase()
      if (currentVariantKeys.has(partnerKey)) {
        if (!currentVariantKeys.has(grabKey)) {
          currentVariantKeys.add(grabKey)
          storeCandidates.push(grab)
        }
      } else if (currentVariantKeys.has(grabKey)) {
        if (!currentVariantKeys.has(partnerKey)) {
          currentVariantKeys.add(partnerKey)
          storeCandidates.push(partner)
        }
      }
    }
    const [layoutRes, orderLists] = await Promise.all([
      getPosTableLayout({ storeCode }).catch(() => ({ layout: [], storeCode })),
      Promise.all(
        (storeCandidates.length ? storeCandidates : [storeCode]).map((sc) =>
          getPosOrdersWithCache({
            storeCode: sc,
            startStr: businessDate,
            endStr: businessDate,
            posBizDayScope: true,
          }).catch(() => [])
        )
      ),
    ])
    const mergedOrdersById = new Map<number, PosOrder>()
    for (const rows of orderLists || []) {
      for (const row of rows || []) {
        const id = Number(row.id || 0)
        if (id > 0) mergedOrdersById.set(id, row)
      }
    }
    const ordersRes = Array.from(mergedOrdersById.values())
    const fetchedLayout = layoutRes.layout || []
    const cachedLayout = layoutByStoreIdRef.current[storeCode] || []
    const layout = fetchedLayout.length > 0 ? fetchedLayout : cachedLayout
    const activeOrders = (ordersRes || []).filter(
      (o) => !['cancelled', 'refunded'].includes((o.status ?? '').toLowerCase())
    )
    const dineInOrders = activeOrders.filter(
      (o) =>
        o.orderType === 'dine_in' &&
        (o.tableName ?? '').trim() !== '' &&
        !['cancelled', 'refunded', 'completed'].includes((o.status ?? '').toLowerCase())
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
      activeOrders,
    }
  }, [legacyToCanonical, grabIntegrations])

  // API에서 테이블 배치 + 당일 매장 주문으로 사용 중 테이블 반영
  useEffect(() => {
    if (!effectiveStoreCodes?.length) {
      setStores([])
      setLoading(false)
      return
    }
    setLoading(true)
    const businessDate = getPosBusinessDateStr()
    Promise.all(effectiveStoreCodes.map((storeCode) => fetchStoreSnapshot(storeCode, businessDate)))
      .then((results) => {
        const storeList = results.map((r) => r.store)
        const layouts: Record<string, PosTableItem[]> = {}
        const nextOrdersByStore: Record<string, Order[]> = {}
        results.forEach((r) => { layouts[r.storeCode] = r.layout })
        results.forEach((r) => {
          nextOrdersByStore[r.storeCode] = (r.activeOrders || []).map(posOrderToOrder)
        })
        setStores(storeList)
        setLayoutByStoreId(layouts)
        setOrdersByStoreId(nextOrdersByStore)
        setCurrentStoreId((prev) => {
          const next =
            canonicalAuthStore && effectiveStoreCodes.includes(canonicalAuthStore)
              ? canonicalAuthStore
              : effectiveStoreCodes[0]
          return storeList.some((s) => s.id === prev) ? prev : next ?? effectiveStoreCodes[0] ?? ''
        })
      })
      .catch(() => {
        setStores([])
        setOrdersByStoreId({})
      })
      .finally(() => setLoading(false))
  }, [effectiveStoreCodes.join(','), canonicalAuthStore, fetchStoreSnapshot])

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
    const nameNorm = normalizePosTableNameForMatch(name)
    setStores((prev) =>
      prev.map((store) =>
        store.id === storeId
          ? {
              ...store,
              tables: store.tables.map((t) => {
                const tn = String(t.name ?? '').trim()
                const tid = String(t.id ?? '').trim()
                const match =
                  tn === name ||
                  tid === name ||
                  (nameNorm &&
                    (normalizePosTableNameForMatch(tn) === nameNorm ||
                      normalizePosTableNameForMatch(tid) === nameNorm))
                return match ? { ...t, order: undefined, isOccupied: false } : t
              }),
            }
          : store
      )
    )
  }, [])

  const refetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refetchStoresImmediate = useCallback((options?: RefetchStoresOptions) => {
    if (!effectiveStoreCodes?.length) return Promise.resolve()
    const requestedStore = String(options?.storeCode ?? '').trim()
    const targetStoreCodes =
      requestedStore && effectiveStoreCodes.includes(requestedStore)
        ? [requestedStore]
        : options?.scope === 'current' && currentStoreId && effectiveStoreCodes.includes(currentStoreId)
          ? [currentStoreId]
          : effectiveStoreCodes
    if (!targetStoreCodes.length) return Promise.resolve()
    setLoading(true)
    const businessDate = getPosBusinessDateStr()
    return Promise.all(targetStoreCodes.map((storeCode) => fetchStoreSnapshot(storeCode, businessDate)))
      .then((results) => {
        const resultStoreMap = new Map(results.map((r) => [r.storeCode, r.store]))
        const resultLayoutMap = new Map(results.map((r) => [r.storeCode, r.layout]))
        const resultOrdersMap = new Map(results.map((r) => [r.storeCode, (r.activeOrders || []).map(posOrderToOrder)]))

        setStores((prev) => {
          if (targetStoreCodes.length === effectiveStoreCodes.length) {
            return effectiveStoreCodes.map((code) => resultStoreMap.get(code)).filter(Boolean) as Store[]
          }
          return prev.map((store) => resultStoreMap.get(store.id) ?? store)
        })
        setLayoutByStoreId((prev) => {
          const next = { ...prev }
          for (const code of targetStoreCodes) {
            next[code] = resultLayoutMap.get(code) ?? []
          }
          return next
        })
        setOrdersByStoreId((prev) => {
          const next = { ...prev }
          for (const code of targetStoreCodes) {
            next[code] = resultOrdersMap.get(code) ?? []
          }
          return next
        })
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [effectiveStoreCodes.join(','), currentStoreId, fetchStoreSnapshot])

  /** refetchStores 디바운스 (600ms) - 연속 호출 시 API 부하 감소 */
  const refetchStores = useCallback((options?: RefetchStoresOptions) => {
    if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current)
    refetchTimeoutRef.current = setTimeout(() => {
      refetchTimeoutRef.current = null
      refetchStoresImmediate(options)
    }, 600)
  }, [refetchStoresImmediate])

  const orders = useMemo(() => Object.values(ordersByStoreId).flat(), [ordersByStoreId])
  const currentStoreOrders = useMemo(() => {
    if (currentStoreId && Array.isArray(ordersByStoreId[currentStoreId])) {
      return ordersByStoreId[currentStoreId]
    }
    return orders
  }, [ordersByStoreId, currentStoreId, orders])

  const deliveryOrders = currentStoreOrders.filter(
    (o) => o.type === 'delivery' && o.status !== 'ready' && o.status !== 'completed' && o.status !== 'paid'
  )
  const packagedDeliveryOrders = currentStoreOrders.filter(
    (o) => o.type === 'delivery' && o.status === 'ready'
  )
  const completedDeliveryOrders = currentStoreOrders.filter(
    (o) => o.type === 'delivery' && (o.status === 'completed' || o.status === 'paid')
  )
  const takeoutOrders = currentStoreOrders.filter(
    (o) => o.type === 'takeout' && o.status !== 'ready' && o.status !== 'completed' && o.status !== 'paid'
  )
  const packagedTakeoutOrders = currentStoreOrders.filter(
    (o) => o.type === 'takeout' && o.status === 'ready'
  )
  const completedTakeoutOrders = currentStoreOrders.filter(
    (o) => o.type === 'takeout' && (o.status === 'completed' || o.status === 'paid')
  )

  const updateOrderStatus = useCallback((orderId: string, status: Order['status']) => {
    setOrdersByStoreId((prev) => {
      const next: Record<string, Order[]> = {}
      Object.entries(prev).forEach(([storeCode, list]) => {
        next[storeCode] = list.map((order) => (order.id === orderId ? { ...order, status } : order))
      })
      return next
    })
  }, [])

  const currentLayout = (currentStoreId && layoutByStoreId[currentStoreId]) || []

  return {
    stores,
    currentStore,
    currentStoreId,
    currentLayout,
    setCurrentStoreId: setCurrentStoreIdAndPersist,
    updateStore,
    updateTable,
    addTable,
    removeTable,
    clearTables,
    clearTableOrder,
    orders,
    deliveryOrders,
    packagedDeliveryOrders,
    completedDeliveryOrders,
    takeoutOrders,
    packagedTakeoutOrders,
    completedTakeoutOrders,
    updateOrderStatus,
    loadingTables: loading,
    refetchStores,
  }
}
