'use client'

import React, { createContext, useContext, useState, useCallback } from 'react'
import { isOfficeStore } from '@/lib/permissions'

export interface StoreViewContextValue {
  /** 모바일에서 오피스 직원이 선택한 "조회 기준 매장" (없으면 null) */
  viewStore: string | null
  setViewStore: (store: string | null) => void
}

const StoreViewContext = createContext<StoreViewContextValue | null>(null)

export function StoreViewProvider({ children }: { children: React.ReactNode }) {
  const [viewStore, setViewStoreState] = useState<string | null>(null)
  const setViewStore = useCallback((store: string | null) => {
    setViewStoreState(store)
  }, [])
  return (
    <StoreViewContext.Provider value={{ viewStore, setViewStore }}>
      {children}
    </StoreViewContext.Provider>
  )
}

export function useStoreView() {
  const ctx = useContext(StoreViewContext)
  return ctx ?? { viewStore: null, setViewStore: () => {} }
}

/** Office(본사)가 아닌 실제 매장만 반환 */
export function filterNonOfficeStores(stores: string[]): string[] {
  return stores.filter((s) => {
    const x = String(s || '').trim()
    return x && !isOfficeStore(x)
  })
}

/** 오피스 직원 기본 조회 매장: 본사(Office) 우선, 없으면 첫 실매장 */
export function resolveDefaultViewStoreForOffice(
  stores: string[],
  authStore?: string
): string | null {
  const list = stores.map((s) => String(s || '').trim()).filter(Boolean)
  const officeFromList = list.find((s) => isOfficeStore(s))
  if (officeFromList) return officeFromList
  const logged = String(authStore || '').trim()
  if (logged && isOfficeStore(logged)) return logged
  const branches = filterNonOfficeStores(list)
  return branches[0] ?? null
}
