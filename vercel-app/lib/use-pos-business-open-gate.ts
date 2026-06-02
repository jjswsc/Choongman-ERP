'use client'

import { useCallback, useEffect, useState } from 'react'
import {
  checkPosBusinessOpenClient,
  type PosBusinessOpenBlockReason,
} from '@/lib/pos-business-open-gate-client'
import { POS_BUSINESS_OPEN_UPDATED_EVENT } from '@/lib/offline/settlement-offline'
import { useStoreList } from '@/lib/api-client'

export type PosBusinessOpenGateState = {
  loading: boolean
  /** 영업 시작(시재) 완료 — skip이면 true */
  allowed: boolean
  businessDateYmd: string
  blockReason: PosBusinessOpenBlockReason
  prevBusinessDateYmd?: string
  refresh: () => Promise<void>
}

export function usePosBusinessOpenGate(
  storeCode: string | null | undefined,
  options?: { skip?: boolean }
): PosBusinessOpenGateState {
  const skip = options?.skip ?? false
  const { resolveStoreKey, legacyToCanonical, storeLabels } = useStoreList()
  const [loading, setLoading] = useState(!skip)
  const [allowed, setAllowed] = useState(skip)
  const [businessDateYmd, setBusinessDateYmd] = useState('')
  const [blockReason, setBlockReason] = useState<PosBusinessOpenBlockReason>('none')
  const [prevBusinessDateYmd, setPrevBusinessDateYmd] = useState<string | undefined>()

  const refresh = useCallback(async () => {
    if (skip) {
      setAllowed(true)
      setBlockReason('none')
      setPrevBusinessDateYmd(undefined)
      setLoading(false)
      return
    }
    const store = String(storeCode ?? '').trim()
    if (!store) {
      setAllowed(false)
      setBusinessDateYmd('')
      setBlockReason('never_opened')
      setPrevBusinessDateYmd(undefined)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const result = await checkPosBusinessOpenClient({
        storeCode: store,
        resolveStoreKey,
        legacyToCanonical,
        storeLabels,
      })
      setBusinessDateYmd(result.businessDateYmd)
      setAllowed(result.allowed)
      setBlockReason(result.blockReason)
      setPrevBusinessDateYmd(result.prevBusinessDateYmd)
    } catch {
      setAllowed(false)
      setBlockReason('never_opened')
      setPrevBusinessDateYmd(undefined)
    } finally {
      setLoading(false)
    }
  }, [skip, storeCode, resolveStoreKey, legacyToCanonical, storeLabels])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (skip) return
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    const onBusinessOpenUpdated = () => {
      void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener(POS_BUSINESS_OPEN_UPDATED_EVENT, onBusinessOpenUpdated)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener(POS_BUSINESS_OPEN_UPDATED_EVENT, onBusinessOpenUpdated)
    }
  }, [refresh, skip])

  return { loading, allowed, businessDateYmd, blockReason, prevBusinessDateYmd, refresh }
}
