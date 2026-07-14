'use client'

import { useState, useEffect, useCallback, useMemo } from 'react'
import { getStoreListWithCache } from './offline/erp-offline'
import { dedupeOfficeStoreOptions } from './office-store-canonical'
import { buildPosTerminalStoreCodes } from './pos-sales-test-office'
import { resolveStoreListKey, labelForStore } from './store-list-keys'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5분 (메모리 캐시)

export type StaffByStore = Record<string, { name: string; nick: string; job?: string; role?: string }[]>

let cache: {
  scopeKey: string
  data: {
    stores: string[]
    allStores?: string[]
    users: Record<string, string[]>
    staffByStore?: StaffByStore
    storeLabels?: Record<string, string>
    legacyToCanonical?: Record<string, string>
    usedMaster?: boolean
  } | null
  expiry: number
} = { scopeKey: '', data: null, expiry: 0 }

function clientStoreListScopeKey(): string {
  if (typeof window === 'undefined') return 'ssr'
  try {
    const tenant = String(sessionStorage.getItem('cm_tenant_id') || '').trim().toLowerCase()
    if (tenant) return `t:${tenant}`
    const company = String(sessionStorage.getItem('cm_company') || '').trim().toLowerCase()
    if (company) return `c:${company}`
  } catch {
    /* ignore */
  }
  return 'anon'
}

export function useStoreList() {
  const [stores, setStores] = useState<string[]>([])
  const [allStores, setAllStores] = useState<string[]>([])
  const [users, setUsers] = useState<Record<string, string[]>>({})
  const [staffByStore, setStaffByStore] = useState<StaffByStore>({})
  const [storeLabels, setStoreLabels] = useState<Record<string, string>>({})
  const [legacyToCanonical, setLegacyToCanonical] = useState<Record<string, string>>({})
  const [usedMaster, setUsedMaster] = useState(false)
  const [loading, setLoading] = useState(true)

  const catalogStores = useMemo(
    () => (allStores.length > 0 ? allStores : stores),
    [allStores, stores]
  )

  const posStores = useMemo(
    () => dedupeOfficeStoreOptions(buildPosTerminalStoreCodes(catalogStores, storeLabels)),
    [catalogStores, storeLabels]
  )

  const resolveStoreKey = useCallback(
    (raw: string) => resolveStoreListKey(raw, catalogStores, legacyToCanonical),
    [catalogStores, legacyToCanonical]
  )

  const formatStoreLabel = useCallback(
    (code: string) => labelForStore(storeLabels, code),
    [storeLabels]
  )

  const load = useCallback(() => {
    const scopeKey = clientStoreListScopeKey()
    const now = Date.now()
    if (cache.data && cache.scopeKey === scopeKey && cache.expiry > now) {
      setStores(cache.data.stores)
      setAllStores(
        Array.isArray(cache.data.allStores) ? cache.data.allStores : cache.data.stores
      )
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
          allStores: Array.isArray(d.allStores) ? d.allStores : d.stores || [],
          users: d.users || {},
          staffByStore: d.staffByStore || {},
          storeLabels: d.storeLabels || {},
          legacyToCanonical: d.legacyToCanonical || {},
          usedMaster: d.usedMaster ?? false,
        }
        cache = { scopeKey, data: payload, expiry: Date.now() + CACHE_TTL_MS }
        setStores(payload.stores)
        setAllStores(payload.allStores || payload.stores)
        setUsers(payload.users)
        setStaffByStore(payload.staffByStore)
        setStoreLabels(payload.storeLabels)
        setLegacyToCanonical(payload.legacyToCanonical)
        setUsedMaster(payload.usedMaster)
      })
      .catch(() => {
        if (cache.data && cache.scopeKey === scopeKey) {
          setStores(cache.data.stores)
          setAllStores(
        Array.isArray(cache.data.allStores) ? cache.data.allStores : cache.data.stores
      )
          setUsers(cache.data.users)
          setStaffByStore(cache.data.staffByStore || {})
          setStoreLabels(cache.data.storeLabels || {})
          setLegacyToCanonical(cache.data.legacyToCanonical || {})
          setUsedMaster(cache.data.usedMaster ?? false)
          return
        }
        setStores([])
        setAllStores([])
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

  /** ERP·매출·회계 매장 선택 — CM Office·test/HQ 제외 */
  const storeOptions = useMemo(
    () => stores.map((code) => ({ code, label: labelForStore(storeLabels, code) })),
    [stores, storeLabels]
  )

  /** POS·관리자 POS 설정 — CM Office 포함 */
  const posStoreOptions = useMemo(
    () => posStores.map((code) => ({ code, label: labelForStore(storeLabels, code) })),
    [posStores, storeLabels]
  )

  return {
    /** 운영(가맹) 매장만 — 매출·회계·대부분 ERP 선택 */
    stores,
    allStores,
    /** POS·인사·본사 창고·미수미지급·세무(SSO) 등 — CM Office 포함, test/HQ 제외 */
    posStores,
    posStoreOptions,
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
