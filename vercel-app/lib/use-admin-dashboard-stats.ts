"use client"

import { useCallback, useEffect, useState } from "react"
import { getAdminDashboardStats, type AdminDashboardStats } from "@/lib/api-client"
import { useErpPolling } from "@/lib/erp-page-visibility"

const EMPTY_STATS: AdminDashboardStats = {
  unapprovedOrders: 0,
  thisMonthInbound: 0,
  thisMonthOutbound: 0,
  leavePending: 0,
  attPending: 0,
}

/** 사이드바 배지용 — 120s 간격, keep-alive 숨김·백그라운드 탭에서는 폴링 중지 */
const REFRESH_MS = 120_000

export function useAdminDashboardStats(options?: { poll?: boolean }) {
  const [stats, setStats] = useState<AdminDashboardStats>(EMPTY_STATS)

  const load = useCallback(() => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return
    getAdminDashboardStats()
      .then(setStats)
      .catch(() => {})
  }, [])

  useEffect(() => {
    load()
  }, [load])

  useErpPolling(load, REFRESH_MS, {
    enabled: options?.poll,
    refetchOnActivate: options?.poll,
  })

  const refetch = useCallback(() => {
    return getAdminDashboardStats()
      .then(setStats)
      .catch(() => {})
  }, [])

  return { stats, refetch }
}
