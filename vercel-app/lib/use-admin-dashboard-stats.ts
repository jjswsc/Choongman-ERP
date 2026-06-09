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

/** 사이드바 배지용 — POS·주문 흐름과 무관하므로 120s·탭 비활성 시 중지로 Functions 부하 절감 */
const REFRESH_MS = 120_000

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
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return
      getAdminDashboardStats()
        .then((s) => {
          if (!cancelled) setStats(s)
        })
        .catch(() => {})
    }
    load()
    if (!options?.poll) {
      return () => {
        cancelled = true
      }
    }
    const intervalId = window.setInterval(load, REFRESH_MS)
    const onVisibility = () => {
      if (document.visibilityState === "visible") load()
    }
    document.addEventListener("visibilitychange", onVisibility)
    return () => {
      cancelled = true
      window.clearInterval(intervalId)
      document.removeEventListener("visibilitychange", onVisibility)
    }
  }, [options?.poll])

  return { stats, refetch }
}
