"use client"

import { Suspense } from "react"
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar"
import { ErpSidebar } from "@/components/erp/erp-sidebar"
import { ErpHeader } from "@/components/erp/erp-header"
import { AdminContentHelpTabShell } from "@/components/erp/admin-content-help-tab-shell"
import { OfflineBanner } from "@/components/offline-banner"
import { StoreViewProvider } from "@/lib/store-view-context"
import { ErpNavigationProvider } from "@/lib/erp-navigation"
import { ErpKeepAliveDebug } from "@/components/erp/erp-keep-alive-debug"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"

export function AdminShell({ children }: { children: React.ReactNode }) {
  const { lang } = useLang()
  const t = useT(lang)

  return (
    <StoreViewProvider>
      <ErpNavigationProvider>
        <SidebarProvider>
          <ErpSidebar />
          <SidebarInset>
            <ErpHeader />
            <OfflineBanner pendingLabel={t("offlineBannerPendingData")} />
            <Suspense fallback={<div className="min-h-0 flex-1" aria-hidden />}>
              <AdminContentHelpTabShell>{children}</AdminContentHelpTabShell>
            </Suspense>
            <ErpKeepAliveDebug />
          </SidebarInset>
        </SidebarProvider>
      </ErpNavigationProvider>
    </StoreViewProvider>
  )
}
