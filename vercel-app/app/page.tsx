"use client"

import { useLayoutEffect, useState } from "react"
import { AppHeader } from "@/components/app-header"
import { AppNavigation } from "@/components/app-navigation"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { OfflineBanner } from "@/components/offline-banner"
import { StoreViewProvider } from "@/lib/store-view-context"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { HomeTab } from "@/components/tabs/home-tab"
import { OrderTab } from "@/components/tabs/order-tab"
import { UsageTab } from "@/components/tabs/usage-tab"
import { TimesheetTab } from "@/components/tabs/timesheet-tab"
import { HrTab } from "@/components/tabs/hr-tab"
import { AdminTab } from "@/components/tabs/admin-tab"
import { VisitTab } from "@/components/tabs/visit-tab"
import { PettyCashTab } from "@/components/tabs/petty-cash-tab"
import { RepairTab } from "@/components/tabs/repair-tab"

function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

export default function DashboardPage() {
  const { auth, initialized } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const [activeTab, setActiveTab] = useState("home")

  useLayoutEffect(() => {
    if (typeof window === "undefined") return
    if (!initialized) return
    if (auth) return
    const p = window.location.pathname.replace(/\/$/, "") || "/"
    if (p === "/login") return
    window.location.replace("/login")
  }, [initialized, auth])

  if (!initialized || !auth) {
    return <DashboardLoading />
  }

  return (
    <StoreViewProvider>
      <div className="mx-auto min-h-screen max-w-lg bg-background">
        <AppHeader />
        <OfflineBanner offlineMsg={t("offlineBannerMobileCached")} offlineOnly />
        <MobileStoreSelectorBar />
        <AppNavigation activeTab={activeTab} onTabChange={setActiveTab} />
      <main className="pb-8">
        {activeTab === "home" && <HomeTab />}
        {activeTab === "orders" && <OrderTab />}
        {activeTab === "usage" && <UsageTab />}
        {activeTab === "hr" && <HrTab />}
        {activeTab === "timesheet" && <TimesheetTab />}
        {activeTab === "visit" && <VisitTab />}
        {activeTab === "repair" && <RepairTab />}
        {activeTab === "pettycash" && <PettyCashTab />}
        {activeTab === "admin" && <AdminTab />}
      </main>
    </div>
    </StoreViewProvider>
  )
}
