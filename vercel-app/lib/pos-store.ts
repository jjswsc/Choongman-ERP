'use client'

import { useState, useCallback, useEffect } from 'react'
import type { Store, Table, Order } from '@/lib/pos-types'
import { useStoreList } from '@/lib/use-store-list'
import { useAuth } from '@/lib/auth-context'
import { getPosTableLayout, getPosOrders, type PosTableItem, type PosOrder } from '@/lib/api-client'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'

/** 관리자 테이블 배치와 동일한 픽셀 그리드 (pos-table-layout-content 기준) */
const GRID_SIZE = 24
const FLOOR_W = 720
const FLOOR_H = 480
const DEFAULT_GRID_COLS = Math.round(FLOOR_W / GRID_SIZE)
const DEFAULT_GRID_ROWS = Math.round(FLOOR_H / GRID_SIZE)

function posOrderToOrder(po: PosOrder): Order {
  const status = String(po.status ?? 'pending').toLowerCase()
  const orderStatus: Order['status'] =
    status === 'completed' ? 'completed' : 'preparing'
  return {
    id: String(po.id),
    tableId: undefined,
    type: 'dine-in',
    items: (po.items || []).map((it) => ({
      id: String(it.id ?? ''),
      name: String(it.name ?? ''),
      quantity: Number(it.qty ?? 0) || 0,
      price: Number(it.price ?? 0) || 0,
      servedAt: typeof it.servedAt === 'string' ? it.servedAt : null,
      servedBy: typeof it.servedBy === 'string' ? it.servedBy : null,
    })),
    total: Number(po.total ?? 0) || 0,
    status: orderStatus,
    createdAt: new Date(po.createdAt || Date.now()),
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

const DEFAULT_ORDERS: Order[] = [
  {
    id: 'o1',
    type: 'delivery',
    items: [{ id: 'i1', name: '후라이드 치킨', quantity: 2, price: 18000 }],
    total: 36000,
    status: 'preparing',
    createdAt: new Date(Date.now() - 15 * 60000),
    customerName: '김민수',
    customerPhone: '010-1234-5678',
    address: '서울시 강남구 테헤란로 123',
  },
  {
    id: 'o2',
    type: 'delivery',
    items: [
      { id: 'i2', name: '양념 치킨', quantity: 1, price: 19000 },
      { id: 'i3', name: '콜라 1.5L', quantity: 1, price: 3000 },
    ],
    total: 22000,
    status: 'pending',
    createdAt: new Date(Date.now() - 5 * 60000),
    customerName: '이지영',
    customerPhone: '010-9876-5432',
    address: '서울시 서초구 서초대로 456',
  },
  {
    id: 'o3',
    type: 'takeout',
    items: [{ id: 'i4', name: '반반 치킨', quantity: 1, price: 20000 }],
    total: 20000,
    status: 'ready',
    createdAt: new Date(Date.now() - 25 * 60000),
    customerName: '박철수',
    customerPhone: '010-5555-1234',
  },
  {
    id: 'o4',
    type: 'takeout',
    items: [
      { id: 'i5', name: '간장 치킨', quantity: 1, price: 19000 },
      { id: 'i6', name: '치즈볼', quantity: 2, price: 4000 },
    ],
    total: 27000,
    status: 'preparing',
    createdAt: new Date(Date.now() - 10 * 60000),
    customerName: '최영희',
    customerPhone: '010-7777-8888',
  },
]

export function usePosStore() {
  const { stores: storeCodes } = useStoreList()
  const { auth } = useAuth()

  const [stores, setStores] = useState<Store[]>([])
  const [layoutByStoreId, setLayoutByStoreId] = useState<Record<string, PosTableItem[]>>({})
  const [currentStoreId, setCurrentStoreId] = useState<string>('')
  const [orders, setOrders] = useState<Order[]>(DEFAULT_ORDERS)
  const [loading, setLoading] = useState(true)

  // API에서 테이블 배치 + 당일 매장 주문으로 사용 중 테이블 반영
  useEffect(() => {
    if (!storeCodes?.length) {
      setStores([])
      setLoading(false)
      return
    }
    setLoading(true)
    const businessDate = getPosBusinessDateStr()
    Promise.all(
      storeCodes.map(async (storeCode) => {
        const [layoutRes, ordersRes] = await Promise.all([
          getPosTableLayout({ storeCode }).catch(() => ({ layout: [], storeCode })),
          getPosOrders({
            storeCode,
            startStr: businessDate,
            endStr: businessDate,
          }).catch(() => []),
        ])
        const layout = layoutRes.layout || []
        const dineInOrders = (ordersRes || []).filter(
          (o) =>
            o.orderType === 'dine_in' &&
            (o.tableName ?? '').trim() !== '' &&
            !['cancelled', 'refunded'].includes((o.status ?? '').toLowerCase())
        )
        const tables = layoutToTables(layout, dineInOrders)
        return { storeCode, store: { id: storeCode, name: storeCode, gridCols: DEFAULT_GRID_COLS, gridRows: DEFAULT_GRID_ROWS, tables }, layout }
      })
    )
      .then((results) => {
        const storeList = results.map((r) => r.store)
        const layouts: Record<string, PosTableItem[]> = {}
        results.forEach((r) => { layouts[r.storeCode] = r.layout })
        setStores(storeList)
        setLayoutByStoreId(layouts)
        setCurrentStoreId((prev) => {
          const next = auth?.store && storeCodes.includes(auth.store) ? auth.store : storeCodes[0]
          return storeList.some((s) => s.id === prev) ? prev : next ?? storeCodes[0] ?? ''
        })
      })
      .catch(() => setStores([]))
      .finally(() => setLoading(false))
  }, [storeCodes.join(','), auth?.store])

  // storeCodes 변경 시 currentStoreId가 목록에 없으면 첫 매장으로
  useEffect(() => {
    if (!storeCodes.length || !currentStoreId) return
    if (storeCodes.includes(currentStoreId)) return
    setCurrentStoreId(auth?.store && storeCodes.includes(auth.store) ? auth.store : storeCodes[0])
  }, [storeCodes, currentStoreId, auth?.store])

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

  const refetchStores = useCallback(() => {
    if (!storeCodes?.length) return Promise.resolve()
    setLoading(true)
    const businessDate = getPosBusinessDateStr()
    return Promise.all(
      storeCodes.map(async (storeCode) => {
        const [layoutRes, ordersRes] = await Promise.all([
          getPosTableLayout({ storeCode }).catch(() => ({ layout: [], storeCode })),
          getPosOrders({ storeCode, startStr: businessDate, endStr: businessDate }).catch(() => []),
        ])
        const layout = layoutRes.layout || []
        const dineInOrders = (ordersRes || []).filter(
          (o) =>
            o.orderType === 'dine_in' &&
            (o.tableName ?? '').trim() !== '' &&
            !['cancelled', 'refunded'].includes((o.status ?? '').toLowerCase())
        )
        const tables = layoutToTables(layout, dineInOrders)
        return { storeCode, store: { id: storeCode, name: storeCode, gridCols: DEFAULT_GRID_COLS, gridRows: DEFAULT_GRID_ROWS, tables }, layout }
      })
    )
      .then((results) => {
        const storeList = results.map((r) => r.store)
        const layouts: Record<string, PosTableItem[]> = {}
        results.forEach((r) => { layouts[r.storeCode] = r.layout })
        setStores(storeList)
        setLayoutByStoreId(layouts)
      })
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [storeCodes.join(',')])

  const deliveryOrders = orders.filter((o) => o.type === 'delivery' && o.status !== 'completed')
  const takeoutOrders = orders.filter((o) => o.type === 'takeout' && o.status !== 'completed')

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
    orders,
    deliveryOrders,
    takeoutOrders,
    updateOrderStatus,
    loadingTables: loading,
    refetchStores,
  }
}
