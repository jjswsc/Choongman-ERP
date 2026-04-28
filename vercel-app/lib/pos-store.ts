'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Store, Table, Order } from '@/lib/pos-types'
import { useStoreList } from '@/lib/use-store-list'
import { useAuth } from '@/lib/auth-context'
import { isOfficeRole } from '@/lib/permissions'
import { getPosTableLayout, type PosTableItem, type PosOrder, type PosOrderItem } from '@/lib/api-client'
import { getPosOrdersWithCache } from '@/lib/offline/receipts-offline'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { normalizePosTableNameForMatch } from '@/lib/pos-print-translate'

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
  if (v === 'paid') return 'paid'
  if (v === 'ready') return 'ready'
  if (v === 'pending') return 'pending'
  return 'preparing'
}

function posOrderToOrder(po: PosOrder & { orderNo?: string }): Order {
  const inferredType = inferOrderType(po)
  return {
    id: String(po.id),
    tableId: undefined,
    type: inferredType,
    items: (po.items || []).map((it) => {
      const row = it as PosOrderItem
      const menuId1 = String(row.menuId1 ?? row.menuId2 ?? '').trim()
      const optionId1 = String(row.optionId1 ?? row.optionId2 ?? '').trim()
      return {
        id: String(it.id ?? ''),
        name: String(it.name ?? ''),
        quantity: Number(it.qty ?? 0) || 0,
        price: Number(it.price ?? 0) || 0,
        ...(menuId1 ? { menuId: menuId1 } : {}),
        ...(optionId1 ? { optionId: optionId1 } : {}),
        ...(typeof it.note === 'string' && String(it.note).trim()
          ? { note: String(it.note).trim() }
          : {}),
        servedAt: typeof it.servedAt === 'string' ? it.servedAt : null,
        servedBy: typeof it.servedBy === 'string' ? it.servedBy : null,
      }
    }),
    total: Number(po.total ?? 0) || 0,
    status: mapOrderStatus(po.status),
    createdAt: new Date(po.createdAt || Date.now()),
    tableName: String(po.tableName || '').trim() || undefined,
    customerName: String(po.tableName || '').trim() || undefined,
    memo: String(po.memo || '').trim() || undefined,
    orderNo: String(po.orderNo ?? '').trim() || undefined,
    guestCount:
      inferredType === 'dine-in'
        ? Math.max(0, Math.min(99, Math.trunc(Number(po.guestCount ?? 0) || 0)))
        : undefined,
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
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    layoutByStoreIdRef.current = layoutByStoreId
  }, [layoutByStoreId])

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
    const [layoutRes, orderLists] = await Promise.all([
      getPosTableLayout({ storeCode }).catch(() => ({ layout: [], storeCode })),
      Promise.all(
        (storeCandidates.length ? storeCandidates : [storeCode]).map((sc) =>
          getPosOrdersWithCache({
            storeCode: sc,
            startStr: businessDate,
            endStr: businessDate,
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
  }, [legacyToCanonical])

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
    (o) => o.type === 'delivery' && o.status !== 'ready' && o.status !== 'completed'
  )
  const packagedDeliveryOrders = currentStoreOrders.filter(
    (o) => o.type === 'delivery' && o.status === 'ready'
  )
  const completedDeliveryOrders = currentStoreOrders.filter(
    (o) => o.type === 'delivery' && o.status === 'completed'
  )
  const takeoutOrders = currentStoreOrders.filter(
    (o) => o.type === 'takeout' && o.status !== 'ready' && o.status !== 'completed'
  )
  const packagedTakeoutOrders = currentStoreOrders.filter(
    (o) => o.type === 'takeout' && o.status === 'ready'
  )
  const completedTakeoutOrders = currentStoreOrders.filter(
    (o) => o.type === 'takeout' && o.status === 'completed'
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
