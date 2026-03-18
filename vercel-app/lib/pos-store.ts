'use client'

import { useState, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Store, Table, Order } from '@/lib/pos-types'
import { useStoreList } from '@/lib/use-store-list'
import { useAuth } from '@/lib/auth-context'
import { isOfficeRole } from '@/lib/permissions'
import { getPosTableLayout, getPosOrders, type PosTableItem, type PosOrder } from '@/lib/api-client'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'

/** 관리자 테이블 배치와 동일한 픽셀 그리드 (pos-table-layout-content 기준) */
const GRID_SIZE = 24
const FLOOR_W = 720
const FLOOR_H = 480
const DEFAULT_GRID_COLS = Math.round(FLOOR_W / GRID_SIZE)
const DEFAULT_GRID_ROWS = Math.round(FLOOR_H / GRID_SIZE)

function mapOrderType(orderType: string): Order['type'] {
  const v = String(orderType || '').toLowerCase()
  if (v === 'delivery') return 'delivery'
  if (v === 'takeout') return 'takeout'
  return 'dine-in'
}

function mapOrderStatus(status: string): Order['status'] {
  const v = String(status || '').toLowerCase()
  if (v === 'completed') return 'completed'
  if (v === 'paid') return 'paid'
  if (v === 'ready') return 'ready'
  if (v === 'pending') return 'pending'
  return 'preparing'
}

function posOrderToOrder(po: PosOrder & { orderNo?: string }): Order {
  return {
    id: String(po.id),
    tableId: undefined,
    type: mapOrderType(po.orderType),
    items: (po.items || []).map((it) => ({
      id: String(it.id ?? ''),
      name: String(it.name ?? ''),
      quantity: Number(it.qty ?? 0) || 0,
      price: Number(it.price ?? 0) || 0,
      servedAt: typeof it.servedAt === 'string' ? it.servedAt : null,
      servedBy: typeof it.servedBy === 'string' ? it.servedBy : null,
    })),
    total: Number(po.total ?? 0) || 0,
    status: mapOrderStatus(po.status),
    createdAt: new Date(po.createdAt || Date.now()),
    customerName: String(po.tableName || '').trim() || undefined,
    memo: String(po.memo || '').trim() || undefined,
    orderNo: String(po.orderNo ?? '').trim() || undefined,
  }
}

function layoutToTables(
  layout: PosTableItem[],
  dineInOrders: PosOrder[]
): Table[] {
  const orderByTable = new Map<string, PosOrder>()
  for (const o of dineInOrders) {
    const key = String(o.tableName ?? '').trim()
    if (!key) continue
    const existing = orderByTable.get(key)
    if (!existing || new Date(o.createdAt || 0) > new Date(existing.createdAt || 0)) {
      orderByTable.set(key, o)
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
    const posOrder = orderByTable.get(name) ?? orderByTable.get(idStr)
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

export function usePosStore() {
  const { stores: storeCodes } = useStoreList()
  const { auth } = useAuth()
  const canSearchAll = isOfficeRole(auth?.role || '')
  const effectiveStoreCodes = useMemo(() => {
    if (canSearchAll) return storeCodes
    return auth?.store ? [auth.store] : storeCodes
  }, [canSearchAll, auth?.store, storeCodes])

  const [stores, setStores] = useState<Store[]>([])
  const [layoutByStoreId, setLayoutByStoreId] = useState<Record<string, PosTableItem[]>>({})
  const [currentStoreId, setCurrentStoreId] = useState<string>('')
  const [orders, setOrders] = useState<Order[]>([])
  const [loading, setLoading] = useState(true)

  // API에서 테이블 배치 + 당일 매장 주문으로 사용 중 테이블 반영
  useEffect(() => {
    if (!effectiveStoreCodes?.length) {
      setStores([])
      setLoading(false)
      return
    }
    setLoading(true)
    const businessDate = getPosBusinessDateStr()
    Promise.all(
      effectiveStoreCodes.map(async (storeCode) => {
        const [layoutRes, ordersRes] = await Promise.all([
          getPosTableLayout({ storeCode }).catch(() => ({ layout: [], storeCode })),
          getPosOrders({
            storeCode,
            startStr: businessDate,
            endStr: businessDate,
          }).catch(() => []),
        ])
        const layout = layoutRes.layout || []
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
        return { storeCode, store: { id: storeCode, name: storeCode, gridCols: DEFAULT_GRID_COLS, gridRows: DEFAULT_GRID_ROWS, tables }, layout, activeOrders }
      })
    )
      .then((results) => {
        const storeList = results.map((r) => r.store)
        const layouts: Record<string, PosTableItem[]> = {}
        results.forEach((r) => { layouts[r.storeCode] = r.layout })
        setStores(storeList)
        setLayoutByStoreId(layouts)
        const mergedOrders = results
          .flatMap((r) => r.activeOrders || [])
          .map(posOrderToOrder)
        setOrders(mergedOrders)
        setCurrentStoreId((prev) => {
          const next = auth?.store && effectiveStoreCodes.includes(auth.store) ? auth.store : effectiveStoreCodes[0]
          return storeList.some((s) => s.id === prev) ? prev : next ?? effectiveStoreCodes[0] ?? ''
        })
      })
      .catch(() => setStores([]))
      .finally(() => setLoading(false))
  }, [effectiveStoreCodes.join(','), auth?.store])

  // effectiveStoreCodes 변경 시 currentStoreId가 목록에 없으면 첫 매장으로
  useEffect(() => {
    if (!effectiveStoreCodes.length || !currentStoreId) return
    if (effectiveStoreCodes.includes(currentStoreId)) return
    setCurrentStoreId(auth?.store && effectiveStoreCodes.includes(auth.store) ? auth.store : effectiveStoreCodes[0])
  }, [effectiveStoreCodes, currentStoreId, auth?.store])

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
      prev.map((store) =>
        store.id === storeId
          ? {
              ...store,
              tables: store.tables.map((t) =>
                (t.name === name || t.id === name) ? { ...t, order: undefined, isOccupied: false } : t
              ),
            }
          : store
      )
    )
  }, [])

  const refetchTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const refetchStoresImmediate = useCallback(() => {
    if (!effectiveStoreCodes?.length) return Promise.resolve()
    setLoading(true)
    const businessDate = getPosBusinessDateStr()
    return Promise.all(
      effectiveStoreCodes.map(async (storeCode) => {
        const [layoutRes, ordersRes] = await Promise.all([
          getPosTableLayout({ storeCode }).catch(() => ({ layout: [], storeCode })),
          getPosOrders({ storeCode, startStr: businessDate, endStr: businessDate }).catch(() => []),
        ])
        const layout = layoutRes.layout || []
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
        return { storeCode, store: { id: storeCode, name: storeCode, gridCols: DEFAULT_GRID_COLS, gridRows: DEFAULT_GRID_ROWS, tables }, layout, activeOrders }
      })
    )
      .then((results) => {
        const storeList = results.map((r) => r.store)
        const layouts: Record<string, PosTableItem[]> = {}
        results.forEach((r) => { layouts[r.storeCode] = r.layout })
        setStores(storeList)
        setLayoutByStoreId(layouts)
        const mergedOrders = results
          .flatMap((r) => r.activeOrders || [])
          .map(posOrderToOrder)
        setOrders(mergedOrders)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [effectiveStoreCodes.join(',')])

  /** refetchStores 디바운스 (600ms) - 연속 호출 시 API 부하 감소 */
  const refetchStores = useCallback(() => {
    if (refetchTimeoutRef.current) clearTimeout(refetchTimeoutRef.current)
    refetchTimeoutRef.current = setTimeout(() => {
      refetchTimeoutRef.current = null
      refetchStoresImmediate()
    }, 600)
  }, [refetchStoresImmediate])

  const deliveryOrders = orders.filter((o) => o.type === 'delivery' && o.status !== 'ready' && o.status !== 'completed')
  const packagedDeliveryOrders = orders.filter((o) => o.type === 'delivery' && o.status === 'ready')
  const completedDeliveryOrders = orders.filter((o) => o.type === 'delivery' && o.status === 'completed')
  const takeoutOrders = orders.filter((o) => o.type === 'takeout' && o.status !== 'ready' && o.status !== 'completed')
  const packagedTakeoutOrders = orders.filter((o) => o.type === 'takeout' && o.status === 'ready')
  const completedTakeoutOrders = orders.filter((o) => o.type === 'takeout' && o.status === 'completed')

  const updateOrderStatus = useCallback((orderId: string, status: Order['status']) => {
    setOrders((prev) =>
      prev.map((order) => (order.id === orderId ? { ...order, status } : order))
    )
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
