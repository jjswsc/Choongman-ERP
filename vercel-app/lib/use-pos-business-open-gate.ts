'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  checkPosBusinessOpenClient,
  type PosBusinessOpenBlockReason,
} from '@/lib/pos-business-open-gate-client'
import { shouldKeepPosBusinessOpenOnQuietRecheck } from '@/lib/pos-business-open-gate'
import { POS_BUSINESS_OPEN_UPDATED_EVENT } from '@/lib/offline/settlement-offline'
import { useStoreList } from '@/lib/api-client'
import { normStoreKey } from '@/lib/store-list-keys'
import { addPosStoreCodeVariants } from '@/lib/pos-store-code-variants'
import { isPollTargetVisible } from '@/lib/use-visible-polling'

export const POS_BUSINESS_OPEN_RECHECK_MS = 5 * 60_000
/** 저장 직후 IndexedDB·API 반영 지연을 넘는 짧은 낙관 통과 */
export const POS_BUSINESS_OPEN_OPTIMISTIC_MS = 120_000

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

function storeKeysForOpenEvent(store: string, resolveStoreKey: (raw: string) => string): Set<string> {
  const out = new Set<string>()
  const add = (raw: string) => {
    const t = String(raw || '').trim()
    if (!t) return
    const bucket = new Set<string>()
    addPosStoreCodeVariants(bucket, t)
    for (const v of bucket) {
      const k = normStoreKey(v)
      if (k) out.add(k)
    }
  }
  add(store)
  add(resolveStoreKey(store) || store)
  return out
}

function posBusinessOpenEventStoreMatches(
  savedStore: string,
  currentStore: string,
  resolveStoreKey: (raw: string) => string
): boolean {
  if (!savedStore || !currentStore) return false
  if (savedStore === currentStore || normStoreKey(savedStore) === normStoreKey(currentStore)) return true
  const savedKeys = storeKeysForOpenEvent(savedStore, resolveStoreKey)
  const currentKeys = storeKeysForOpenEvent(currentStore, resolveStoreKey)
  for (const k of currentKeys) {
    if (savedKeys.has(k)) return true
  }
  return false
}

export function usePosBusinessOpenGate(
  storeCode: string | null | undefined,
  options?: { skip?: boolean }
): PosBusinessOpenGateState {
  const skip = options?.skip ?? false
  const { resolveStoreKey, legacyToCanonical, storeLabels } = useStoreList()
  const optimisticUntilRef = useRef(0)
  const allowedRef = useRef(skip)
  const [loading, setLoading] = useState(!skip)
  const [allowed, setAllowed] = useState(skip)
  const [settlementClosed, setSettlementClosed] = useState(false)
  const [businessDateYmd, setBusinessDateYmd] = useState('')
  const [blockReason, setBlockReason] = useState<PosBusinessOpenBlockReason>('none')
  const [prevBusinessDateYmd, setPrevBusinessDateYmd] = useState<string | undefined>()

  const refresh = useCallback(async (opts?: { quiet?: boolean }) => {
    if (skip) {
      allowedRef.current = true
      setAllowed(true)
      setSettlementClosed(false)
      setBlockReason('none')
      setPrevBusinessDateYmd(undefined)
      setLoading(false)
      return
    }
    const store = String(storeCode ?? '').trim()
    if (!store) {
      allowedRef.current = false
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
      const keepOptimistic = Date.now() < optimisticUntilRef.current
      const keepPrevious =
        Boolean(opts?.quiet) &&
        shouldKeepPosBusinessOpenOnQuietRecheck({
          previouslyAllowed: allowedRef.current,
          resultAllowed: result.allowed,
          blockReason: result.blockReason,
        })
      if (result.allowed || keepOptimistic || keepPrevious) {
        allowedRef.current = true
        setAllowed(true)
        if (result.allowed || keepOptimistic) setBlockReason('none')
      } else {
        allowedRef.current = false
        setAllowed(false)
        setBlockReason(result.blockReason)
      }
      setPrevBusinessDateYmd(result.prevBusinessDateYmd)
    } catch {
      if (!opts?.quiet) {
        allowedRef.current = false
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
        if (posBusinessOpenEventStoreMatches(savedStore, store, resolveStoreKey)) {
          if (detail?.closed === true) {
            setSettlementClosed(true)
            setLoading(false)
          } else {
            optimisticUntilRef.current = Date.now() + POS_BUSINESS_OPEN_OPTIMISTIC_MS
            allowedRef.current = true
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
    /** 숨김 탭은 위 onVisible 이 복귀 시 갱신하므로 주기 재확인을 건너뛴다 */
    const recheckId = window.setInterval(() => {
      if (!isPollTargetVisible()) return
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
