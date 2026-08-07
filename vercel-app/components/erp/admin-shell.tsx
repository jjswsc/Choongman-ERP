"use client"

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
                {/*
                  KeepAlive를 감싼 Suspense를 두면 탭 전환 RSC 대기 중 fallback으로
                  KeepAlive 전체가 unmount되어 검색·필터 상태가 초기화된다.
                  Suspense는 AdminPageKeepAlive 내부 children에만 둔다.
                */}
                <AdminContentHelpTabShell>{children}</AdminContentHelpTabShell>
                <ErpKeepAliveDebug />
              </SidebarInset>
            </SidebarProvider>
          </ErpNavFavoritesProvider>
        </ErpNavigationProvider>
      </AdminDashboardStatsProvider>
    </StoreViewProvider>
  )
}
