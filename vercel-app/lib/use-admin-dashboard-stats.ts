"use client"

import * as React from "react"
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

type AdminDashboardStatsContextValue = {
  stats: AdminDashboardStats
  refetch: () => Promise<void>
}

const AdminDashboardStatsContext = React.createContext<AdminDashboardStatsContextValue | null>(null)

/** 관리자 셸에서 1회만 폴링 — 사이드바·대시보드·실시간 매출이 공유 */
export function AdminDashboardStatsProvider({ children }: { children: React.ReactNode }) {
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
    enabled: true,
    refetchOnActivate: true,
  })

  const refetch = useCallback(() => {
    return getAdminDashboardStats()
      .then(setStats)
      .catch(() => {})
  }, [])

  const value = React.useMemo(() => ({ stats, refetch }), [stats, refetch])

  return React.createElement(AdminDashboardStatsContext.Provider, { value }, children)
}

/**
 * @param options.poll — deprecated, 무시됨. 폴링은 AdminDashboardStatsProvider 단일 인스턴스만 수행.
 */
export function useAdminDashboardStats(_options?: { poll?: boolean }) {
  const ctx = React.useContext(AdminDashboardStatsContext)
  const [fallbackStats, setFallbackStats] = useState<AdminDashboardStats>(EMPTY_STATS)

  useEffect(() => {
    if (ctx) return
    getAdminDashboardStats()
      .then(setFallbackStats)
      .catch(() => {})
  }, [ctx])

  const fallbackRefetch = useCallback(() => {
    return getAdminDashboardStats()
      .then(setFallbackStats)
      .catch(() => {})
  }, [])

  if (ctx) return ctx
  return { stats: fallbackStats, refetch: fallbackRefetch }
}
