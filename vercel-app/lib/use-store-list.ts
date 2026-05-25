'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getStoreListWithCache } from './offline/erp-offline'
import { resolveStoreListKey, labelForStore } from './store-list-keys'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5분 (메모리 캐시)

export type StaffByStore = Record<string, { name: string; nick: string; job?: string; role?: string }[]>

let cache: {
  data: {
    stores: string[]
    users: Record<string, string[]>
    staffByStore?: StaffByStore
    storeLabels?: Record<string, string>
    legacyToCanonical?: Record<string, string>
    usedMaster?: boolean
  } | null
  expiry: number
} = { data: null, expiry: 0 }

export function useStoreList() {
  const [stores, setStores] = useState<string[]>([])
  const [users, setUsers] = useState<Record<string, string[]>>({})
  const [staffByStore, setStaffByStore] = useState<StaffByStore>({})
  const [storeLabels, setStoreLabels] = useState<Record<string, string>>({})
  const [legacyToCanonical, setLegacyToCanonical] = useState<Record<string, string>>({})
  const [usedMaster, setUsedMaster] = useState(false)
  const [loading, setLoading] = useState(true)

  const resolveStoreKey = useCallback(
    (raw: string) => resolveStoreListKey(raw, stores, legacyToCanonical),
    [stores, legacyToCanonical]
  )

  const formatStoreLabel = useCallback(
    (code: string) => labelForStore(storeLabels, code),
    [storeLabels]
  )

  const load = useCallback(() => {
    const now = Date.now()
    if (cache.data && cache.expiry > now) {
      setStores(cache.data.stores)
      setUsers(cache.data.users)
      setStaffByStore(cache.data.staffByStore || {})
      setStoreLabels(cache.data.storeLabels || {})
      setLegacyToCanonical(cache.data.legacyToCanonical || {})
      setUsedMaster(cache.data.usedMaster ?? false)
      setLoading(false)
      return
    }
    setLoading(true)
    getStoreListWithCache()
      .then((d) => {
        const payload = {
          stores: d.stores || [],
          users: d.users || {},
          staffByStore: d.staffByStore || {},
          storeLabels: d.storeLabels || {},
          legacyToCanonical: d.legacyToCanonical || {},
          usedMaster: d.usedMaster ?? false,
        }
        cache = { data: payload, expiry: Date.now() + CACHE_TTL_MS }
        setStores(payload.stores)
        setUsers(payload.users)
        setStaffByStore(payload.staffByStore)
        setStoreLabels(payload.storeLabels)
        setLegacyToCanonical(payload.legacyToCanonical)
        setUsedMaster(payload.usedMaster)
      })
      .catch(() => {
        if (cache.data) {
          setStores(cache.data.stores)
          setUsers(cache.data.users)
          setStaffByStore(cache.data.staffByStore || {})
          setStoreLabels(cache.data.storeLabels || {})
          setLegacyToCanonical(cache.data.legacyToCanonical || {})
          setUsedMaster(cache.data.usedMaster ?? false)
          return
        }
        setStores([])
        setUsers({})
        setStaffByStore({})
        setStoreLabels({})
        setLegacyToCanonical({})
        setUsedMaster(false)
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const storeOptions = useMemo(
    () => stores.map((code) => ({ code, label: labelForStore(storeLabels, code) })),
    [stores, storeLabels]
  )

  return {
    stores,
    users,
    staffByStore,
    storeLabels,
    legacyToCanonical,
    usedMaster,
    storeOptions,
    resolveStoreKey,
    formatStoreLabel,
    loading,
    refetch: load,
  }
}
