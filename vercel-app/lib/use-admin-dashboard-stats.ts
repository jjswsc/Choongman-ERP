"use client"

import { useCallback, useEffect, useState } from "react"
import { getAdminDashboardStats, type AdminDashboardStats } from "@/lib/api-client"

const EMPTY_STATS: AdminDashboardStats = {
  unapprovedOrders: 0,
  thisMonthInbound: 0,
  thisMonthOutbound: 0,
  leavePending: 0,
  attPending: 0,
}

const REFRESH_MS = 60_000

export function useAdminDashboardStats(options?: { poll?: boolean }) {
  const [stats, setStats] = useState<AdminDashboardStats>(EMPTY_STATS)

  const refetch = useCallback(() => {
    return getAdminDashboardStats()
      .then(setStats)
      .catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    const load = () => {
      getAdminDashboardStats()
        .then((s) => {
          if (!cancelled) setStats(s)
        })
        .catch(() => {})
    }
    load()
    if (!options?.poll) return () => {
      cancelled = true
    }
    const id = window.setInterval(load, REFRESH_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [options?.poll])

  return { stats, refetch }
}
