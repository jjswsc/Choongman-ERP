"use client"

import dynamic from "next/dynamic"
import { useLayoutEffect, useState } from "react"
import { AppHeader } from "@/components/app-header"
import { AppNavigation } from "@/components/app-navigation"
import { MobileStoreSelectorBar } from "@/components/erp/mobile-store-selector-bar"
import { OfflineBanner } from "@/components/offline-banner"
import { StoreViewProvider, useStoreView } from "@/lib/store-view-context"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { isOfficeRole, isOfficeStore } from "@/lib/permissions"
import { useMarketingMaterialPendingCount } from "@/hooks/use-marketing-material-pending-count"

function DashboardLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

function DashboardTabLoading() {
  return (
    <div className="flex justify-center px-4 py-6">
      <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary border-t-transparent" />
    </div>
  )
}

const HomeTab = dynamic(() => import("@/components/tabs/home-tab").then((m) => m.HomeTab), {
  loading: () => <DashboardTabLoading />,
})
const OrderTab = dynamic(() => import("@/components/tabs/order-tab").then((m) => m.OrderTab), {
  loading: () => <DashboardTabLoading />,
})
const UsageTab = dynamic(() => import("@/components/tabs/usage-tab").then((m) => m.UsageTab), {
  loading: () => <DashboardTabLoading />,
})
const TimesheetTab = dynamic(
  () => import("@/components/tabs/timesheet-tab").then((m) => m.TimesheetTab),
  {
    loading: () => <DashboardTabLoading />,
  }
)
const HrTab = dynamic(() => import("@/components/tabs/hr-tab").then((m) => m.HrTab), {
  loading: () => <DashboardTabLoading />,
})
const AdminTab = dynamic(() => import("@/components/tabs/admin-tab").then((m) => m.AdminTab), {
  loading: () => <DashboardTabLoading />,
})
const VisitTab = dynamic(() => import("@/components/tabs/visit-tab").then((m) => m.VisitTab), {
  loading: () => <DashboardTabLoading />,
})
const PettyCashTab = dynamic(
  () => import("@/components/tabs/petty-cash-tab").then((m) => m.PettyCashTab),
  {
    loading: () => <DashboardTabLoading />,
  }
)
const RepairTab = dynamic(() => import("@/components/tabs/repair-tab").then((m) => m.RepairTab), {
  loading: () => <DashboardTabLoading />,
})

function DashboardMain() {
  const { auth } = useAuth()
  const { viewStore } = useStoreView()
  const { lang } = useLang()
  const t = useT(lang)
  const [activeTab, setActiveTab] = useState("home")

  const isOffice = Boolean(
    auth && (isOfficeRole(auth.role || "") || isOfficeStore(auth.store || ""))
  )
  const effectiveStore =
    isOffice && viewStore ? viewStore : String(auth?.store || "").trim()
  const { count: materialsPendingCount, reload: reloadMaterialsPending } =
    useMarketingMaterialPendingCount(effectiveStore)

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-background">
      <AppHeader />
      <OfflineBanner offlineMsg={t("offlineBannerMobileCached")} offlineOnly />
      <MobileStoreSelectorBar />
      <AppNavigation
        activeTab={activeTab}
        onTabChange={setActiveTab}
        ordersBadge={materialsPendingCount}
      />
      <main className="pb-8">
        {activeTab === "home" && <HomeTab />}
        {activeTab === "orders" && (
          <OrderTab
            materialsPendingCount={materialsPendingCount}
            onMaterialsDataChanged={reloadMaterialsPending}
          />
        )}
        {activeTab === "usage" && <UsageTab />}
        {activeTab === "hr" && <HrTab />}
        {activeTab === "timesheet" && <TimesheetTab />}
        {activeTab === "visit" && <VisitTab />}
        {activeTab === "repair" && <RepairTab />}
        {activeTab === "pettycash" && <PettyCashTab />}
        {activeTab === "admin" && <AdminTab />}
      </main>
    </div>
  )
}

export default function DashboardPage() {
  const { auth, initialized } = useAuth()

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
      <DashboardMain />
    </StoreViewProvider>
  )
}
