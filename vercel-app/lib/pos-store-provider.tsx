'use client'

import { createContext, useContext } from 'react'
import { usePosStoreInternal } from '@/lib/pos-store'

export type PosStoreValue = ReturnType<typeof usePosStoreInternal>

const PosStoreContext = createContext<PosStoreValue | null>(null)

/** POS 레이아웃 Provider — /pos/* 페이지 이동 시 주문·테이블 스냅샷 유지 */
export function PosStoreProvider({ children }: { children: React.ReactNode }) {
  const value = usePosStoreInternal()
  return <PosStoreContext.Provider value={value}>{children}</PosStoreContext.Provider>
}

export function usePosStore(): PosStoreValue {
  const ctx = useContext(PosStoreContext)
  if (!ctx) {
    throw new Error('usePosStore must be used within PosStoreProvider')
  }
  return ctx
}
