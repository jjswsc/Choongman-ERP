'use client'

import { useCallback, useEffect, useState } from 'react'
import { getPosBusinessDateStr } from '@/lib/pos-business-day'
import { getPosSettlementWithCache } from '@/lib/offline/settlement-offline'
import { isPosBusinessOpenRecorded } from '@/lib/pos-business-open-gate'
import type { PosSettlement } from '@/lib/api-client'

function normalizeSettlement(
  settlement: PosSettlement | PosSettlement[] | null | undefined
): PosSettlement | null {
  if (!settlement) return null
  return Array.isArray(settlement) ? settlement[0] ?? null : settlement
}

export type PosBusinessOpenGateState = {
  loading: boolean
  /** 영업 시작(시재) 완료 — skip이면 true */
  allowed: boolean
  businessDateYmd: string
  refresh: () => Promise<void>
}

export function usePosBusinessOpenGate(
  storeCode: string | null | undefined,
  options?: { skip?: boolean }
): PosBusinessOpenGateState {
  const skip = options?.skip ?? false
  const [loading, setLoading] = useState(!skip)
  const [allowed, setAllowed] = useState(skip)
  const [businessDateYmd, setBusinessDateYmd] = useState('')

  const refresh = useCallback(async () => {
    if (skip) {
      setAllowed(true)
      setLoading(false)
      return
    }
    const store = String(storeCode ?? '').trim()
    if (!store) {
      setAllowed(false)
      setBusinessDateYmd('')
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const settleDate = getPosBusinessDateStr()
      setBusinessDateYmd(settleDate)
      const data = await getPosSettlementWithCache({ storeCode: store, settleDate })
      setAllowed(isPosBusinessOpenRecorded(normalizeSettlement(data.settlement)))
    } catch {
      setAllowed(false)
    } finally {
      setLoading(false)
    }
  }, [skip, storeCode])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (skip) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
    }
  }, [refresh, skip])

  return { loading, allowed, businessDateYmd, refresh }
}
