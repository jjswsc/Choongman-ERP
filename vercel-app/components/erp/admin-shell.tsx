"use client"

import { Suspense } from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ErpSidebar } from "@/components/erp/erp-sidebar"
import { ErpHeader } from "@/components/erp/erp-header"
import { AdminDesktopPreferredBanner } from "@/components/erp/admin-desktop-preferred-banner"
import { AdminContentHelpTabShell } from "@/components/erp/admin-content-help-tab-shell"
import { OfflineBanner } from "@/components/offline-banner"
import { StoreViewProvider } from "@/lib/store-view-context"
import { ErpNavigationProvider } from "@/lib/erp-navigation"
import { ErpNavFavoritesProvider } from "@/lib/erp-nav-favorites-context"
import { ErpKeepAliveDebug } from "@/components/erp/erp-keep-alive-debug"
import { AdminDashboardStatsProvider } from "@/lib/use-admin-dashboard-stats"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <StoreViewProvider>
      <AdminDashboardStatsProvider>
        <ErpNavigationProvider>
          <ErpNavFavoritesProvider>
            <SidebarProvider>
              <ErpSidebar />
              <SidebarInset className="min-w-0 overflow-x-clip">
                <ErpHeader />
                <AdminDesktopPreferredBanner />
                <OfflineBanner pendingLabel={t("offlineBannerPendingData")} />
                <Suspense fallback={<div className="min-h-0 flex-1" aria-hidden />}>
                  <AdminContentHelpTabShell>{children}</AdminContentHelpTabShell>
                </Suspense>
                <ErpKeepAliveDebug />
              </SidebarInset>
            </SidebarProvider>
          </ErpNavFavoritesProvider>
        </ErpNavigationProvider>
      </AdminDashboardStatsProvider>
    </StoreViewProvider>
  )
}
