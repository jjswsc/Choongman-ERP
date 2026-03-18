"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { AppHeader } from "@/components/app-header"
import { AppNavigation } from "@/components/app-navigation"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { OfflineBanner } from "@/components/offline-banner"
import { StoreViewProvider } from "@/lib/store-view-context"
import { useAuth } from "@/lib/auth-context"
import { HomeTab } from "@/components/tabs/home-tab"
import { OrderTab } from "@/components/tabs/order-tab"
import { UsageTab } from "@/components/tabs/usage-tab"
import { TimesheetTab } from "@/components/tabs/timesheet-tab"
import { HrTab } from "@/components/tabs/hr-tab"
import { AdminTab } from "@/components/tabs/admin-tab"
import { VisitTab } from "@/components/tabs/visit-tab"
import { PettyCashTab } from "@/components/tabs/petty-cash-tab"

function DashboardLoading() {
  const [stuck, setStuck] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setStuck(true), 6000)
    return () => clearTimeout(t)
  }, [])
  if (stuck) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-background p-4">
        <p className="text-center text-sm text-muted-foreground">로딩이 오래 걸립니다. 새로고침해 보세요.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="rounded bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          새로고침
        </button>
      </div>
    )
  }
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export default function DashboardPage() {
  const router = useRouter()
  const { auth, initialized } = useAuth()
  const [activeTab, setActiveTab] = useState("home")

  useEffect(() => {
    if (!initialized) return
    if (!auth) {
      router.replace("/login")
      return
    }
  }, [auth, initialized, router])

  if (!initialized || !auth) {
    return <DashboardLoading />
  }

  return (
    <StoreViewProvider>
      <div className="mx-auto min-h-screen max-w-lg bg-background">
        <AppHeader />
        <OfflineBanner offlineMsg="오프라인 모드 — 캐시된 데이터를 사용 중입니다. 연결 복구 후 자동 동기화됩니다." offlineOnly />
        <MobileStoreSelectorBar />
        <AppNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="pb-8">
        {activeTab === "home" && <HomeTab />}
        {activeTab === "orders" && <OrderTab />}
        {activeTab === "usage" && <UsageTab />}
        {activeTab === "hr" && <HrTab />}
        {activeTab === "timesheet" && <TimesheetTab />}
        {activeTab === "visit" && <VisitTab />}
        {activeTab === "pettycash" && <PettyCashTab />}
        {activeTab === "admin" && <AdminTab />}
      </main>
    </div>
    </StoreViewProvider>
  )
}
