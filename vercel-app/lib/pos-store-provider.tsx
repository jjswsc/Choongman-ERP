'use client'

import { createContext, useContext, useMemo } from 'react'
import type { PosFloorLabels } from '@/lib/api-client'
import { isPosCustomerDisplayPathname } from '@/lib/pos-customer-display-state'
import { usePosStoreInternal } from '@/lib/pos-store'

export type PosStoreValue = ReturnType<typeof usePosStoreInternal>

const PosStoreContext = createContext<PosStoreValue | null>(null)

const noop = () => {}
const asyncNoop = async () => {}

/** 손님 모니터 등 Provider 밖·레이스에서 usePosStore가 호출돼도 앱이 죽지 않게 하는 빈 스냅샷 */
export const POS_STORE_CUSTOMER_DISPLAY_STUB: PosStoreValue = {
  stores: [],
  currentStore: undefined,
  currentStoreId: '',
  currentLayout: [],
  currentFloorLabels: {} as PosFloorLabels,
  setCurrentStoreId: noop,
  updateStore: noop,
  updateTable: noop,
  addTable: noop,
  removeTable: noop,
  clearTables: noop,
  clearTableOrder: noop,
  removeTerminalOrder: noop,
  orders: [],
  deliveryOrders: [],
  packagedDeliveryOrders: [],
  completedDeliveryOrders: [],
  takeoutOrders: [],
  packagedTakeoutOrders: [],
  completedTakeoutOrders: [],
  advanceOrders: [],
  updateOrderStatus: noop,
  upsertOptimisticOrder: noop,
  upsertOrderFromServer: noop,
  clearTerminalOrderPaymentTenders: noop,
  loadingTables: false,
  refetchStores: asyncNoop,
}

/** POS 레이아웃 Provider — /pos/* 페이지 이동 시 주문·테이블 스냅샷 유지 */
export function PosStoreProvider({ children }: { children: React.ReactNode }) {
  const value = usePosStoreInternal({ initialLoadScope: 'current' })
  return <PosStoreContext.Provider value={value}>{children}</PosStoreContext.Provider>
}

/**
 * 손님 모니터 전용 — 주문 스냅샷을 불러오지 않고 Context만 채워
 * 레이아웃 레이스·잘못된 자식 마운트로 usePosStore가 호출돼도 크래시하지 않게 한다.
 */
export function PosStoreStubProvider({ children }: { children: React.ReactNode }) {
  const value = useMemo(() => POS_STORE_CUSTOMER_DISPLAY_STUB, [])
  return <PosStoreContext.Provider value={value}>{children}</PosStoreContext.Provider>
}

export function usePosStoreOptional(): PosStoreValue | null {
  return useContext(PosStoreContext)
}

export function usePosStore(): PosStoreValue {
  const ctx = useContext(PosStoreContext)
  if (ctx) return ctx
  if (typeof window !== 'undefined' && isPosCustomerDisplayPathname(window.location.pathname || '')) {
    return POS_STORE_CUSTOMER_DISPLAY_STUB
  }
  throw new Error('usePosStore must be used within PosStoreProvider')
}
