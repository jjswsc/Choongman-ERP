'use client'

import { useState, useEffect, useCallback } from 'react'
import { apiFetch } from './api/fetch'

const CACHE_TTL_MS = 5 * 60 * 1000 // 5분

let cache: {
  data: { stores: string[]; users: Record<string, string[]> } | null
  expiry: number
} = { data: null, expiry: 0 }

async function fetchStoreList(): Promise<{ stores: string[]; users: Record<string, string[]> }> {
  const res = await apiFetch('/api/getStoreList')
  return res.json()
}

export function useStoreList() {
  const [stores, setStores] = useState<string[]>([])
  const [users, setUsers] = useState<Record<string, string[]>>({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(() => {
    const now = Date.now()
    if (cache.data && cache.expiry > now) {
      setStores(cache.data.stores)
      setUsers(cache.data.users)
      setLoading(false)
      return
    }
    setLoading(true)
    fetchStoreList()
      .then((d) => {
        cache = { data: d, expiry: Date.now() + CACHE_TTL_MS }
        setStores(d.stores || [])
        setUsers(d.users || {})
      })
      .catch(() => {
        setStores([])
        setUsers({})
      })
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
  }, [load])

  return { stores, users, loading, refetch: load }
}
