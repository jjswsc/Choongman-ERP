'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkPosBusinessOpenClient,
  type PosBusinessOpenBlockReason,
} from '@/lib/pos-business-open-gate-client'
import { POS_BUSINESS_OPEN_UPDATED_EVENT } from '@/lib/offline/settlement-offline'
import { useStoreList } from '@/lib/api-client'
import { normStoreKey } from '@/lib/store-list-keys'

export const POS_BUSINESS_OPEN_RECHECK_MS = 5 * 60_000

export type PosBusinessOpenGateState = {
  loading: boolean
  /** 영업 시작(시재) 완료 — skip이면 true */
  allowed: boolean
  /** 당일 결산 마감 */
  settlementClosed: boolean
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
  const optimisticUntilRef = useRef(0)
  const [loading, setLoading] = useState(!skip)
  const [allowed, setAllowed] = useState(skip)
  const [settlementClosed, setSettlementClosed] = useState(false)
  const [businessDateYmd, setBusinessDateYmd] = useState('')
  const [blockReason, setBlockReason] = useState<PosBusinessOpenBlockReason>('none')
  const [prevBusinessDateYmd, setPrevBusinessDateYmd] = useState<string | undefined>()

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (skip) {
      setAllowed(true)
      setSettlementClosed(false)
      setBlockReason('none')
      setPrevBusinessDateYmd(undefined)
      setLoading(false)
      return
    }
    const store = String(storeCode ?? '').trim()
    if (!store) {
      setAllowed(false)
      setSettlementClosed(false)
      setBusinessDateYmd('')
      setBlockReason('never_opened')
      setPrevBusinessDateYmd(undefined)
      setLoading(false)
      return
    }
    if (!opts?.quiet) setLoading(true)
    try {
      const result = await checkPosBusinessOpenClient({
        storeCode: store,
        resolveStoreKey,
        legacyToCanonical,
        storeLabels,
      })
      setBusinessDateYmd(result.businessDateYmd)
      setSettlementClosed(Boolean(result.settlementClosed))
      if (result.allowed || Date.now() < optimisticUntilRef.current) {
        setAllowed(true)
        setBlockReason('none')
      } else {
        setAllowed(false)
        setBlockReason(result.blockReason)
      }
      setPrevBusinessDateYmd(result.prevBusinessDateYmd)
    } catch {
      if (!opts?.quiet) {
        setAllowed(false)
        setSettlementClosed(false)
        setBlockReason('never_opened')
        setPrevBusinessDateYmd(undefined)
      }
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
      if (document.visibilityState === 'visible') void refresh({ quiet: true })
    }
    const onBusinessOpenUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ storeCode?: string; settleDate?: string; closed?: boolean }>).detail
      const store = String(storeCode ?? '').trim()
      const savedStore = String(detail?.storeCode ?? '').trim()
      const savedDate = String(detail?.settleDate ?? '').trim().slice(0, 10)
      if (store && savedStore && savedDate) {
        const storeMatch =
          savedStore === store ||
          normStoreKey(savedStore) === normStoreKey(store) ||
          normStoreKey(resolveStoreKey(savedStore)) === normStoreKey(resolveStoreKey(store))
        if (storeMatch) {
          if (detail?.closed === true) {
            setSettlementClosed(true)
            setLoading(false)
          } else {
            optimisticUntilRef.current = Date.now() + 8000
            setAllowed(true)
            setSettlementClosed(false)
            setBlockReason('none')
            setBusinessDateYmd(savedDate)
            setLoading(false)
          }
        }
      }
      void refresh({ quiet: true })
    }
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', onVisible)
    window.addEventListener(POS_BUSINESS_OPEN_UPDATED_EVENT, onBusinessOpenUpdated)
    const recheckId = window.setInterval(() => {
      void refresh({ quiet: true })
    }, POS_BUSINESS_OPEN_RECHECK_MS)
    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', onVisible)
      window.removeEventListener(POS_BUSINESS_OPEN_UPDATED_EVENT, onBusinessOpenUpdated)
      window.clearInterval(recheckId)
    }
  }, [refresh, skip, storeCode, resolveStoreKey])

  return { loading, allowed, settlementClosed, businessDateYmd, blockReason, prevBusinessDateYmd, refresh }
}
