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

/** 오피스 직원 기본 조회: 전체 매장(All). 본사(Office) 코드는 집계 대상이 아님 */
export function resolveDefaultViewStoreForOffice(
  _stores: string[],
  _authStore?: string
): string | null {
  return 'All'
}
