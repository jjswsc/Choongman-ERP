'use client'

import { useEffect, useMemo } from 'react'
import { setPosBusinessHoursClient } from '@/lib/pos-business-day'
import { getPosBusinessDaySettings, useStoreList } from '@/lib/api-client'
import { useAuth } from '@/lib/auth-context'
import { usePosStore } from '@/hooks/use-pos-store'
import { resolveStoreListKey } from '@/lib/store-list-keys'

/** POS 단말에서 `getPosBusinessDateStr()`이 서버 설정과 맞도록 주입 (매장 기준 단일 소스) */
export function PosBusinessDayHydrate() {
  const { auth } = useAuth()
  const { currentStoreId } = usePosStore()
  const { posStores: storeCodes, legacyToCanonical } = useStoreList()

  const storeForQuery = useMemo(() => {
    const fromPosStore = String(currentStoreId || '').trim()
    if (fromPosStore) return fromPosStore
    const raw = String(auth?.store || '').trim()
    if (!raw) return ''
    return resolveStoreListKey(raw, storeCodes, legacyToCanonical)
  }, [currentStoreId, auth?.store, storeCodes, legacyToCanonical])

  useEffect(() => {
    let cancel = false
    void (async () => {
      try {
        const j = await getPosBusinessDaySettings(storeForQuery || null)
        if (cancel) return
        setPosBusinessHoursClient({
          start: { hour: j.hour, minute: j.minute },
          end: { hour: j.endHour, minute: j.endMinute },
        })
      } catch {
        /* keep default */
      }
    })()
    return () => {
      cancel = true
    }
  }, [storeForQuery])
  return null
}
