"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { LayoutDashboard, Lock, Pencil, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { prefersLogisticsOperationsDashboard } from "@/lib/permissions"
import { useAdminDashboardStats } from "@/lib/use-admin-dashboard-stats"
import { AdminDashboardPendingOrdersAlert } from "@/components/erp/admin-dashboard-pending-orders-alert"
import { AdminOperationsDashboardPanel } from "@/components/erp/admin-operations-dashboard-panel"
import { ErpNavFavoritesEditor } from "@/components/erp/erp-nav-favorites-editor"
import { useErpNavFavorites } from "@/lib/erp-nav-favorites-context"
import { useErpNavAccess } from "@/lib/use-erp-nav-access"
import { buildErpNavItemByHrefMap, ERP_NAV_DASHBOARD_DESC } from "@/lib/erp-nav-registry"
import { Button } from "@/components/ui/button"

export function AdminHomeDashboard() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const saasModuleLocked = searchParams.get("saas_module_locked") === "1"
  const { auth } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (key: string, fallback: string) => tOr(t, key, fallback)
  const role = auth?.role || ""
  const isLogisticsHome = prefersLogisticsOperationsDashboard(role)
  const { stats: dashboardStats } = useAdminDashboardStats()
  const { dashboardQuickHrefs } = useErpNavFavorites()
  const { isNavItemVisible } = useErpNavAccess()
  const [editorOpen, setEditorOpen] = React.useState(false)
  const navItemByHref = React.useMemo(() => buildErpNavItemByHrefMap(), [])

  const quickLinks = React.useMemo(
    () =>
      (Array.isArray(dashboardQuickHrefs) ? dashboardQuickHrefs : [])
        .map((href, index) => {
          const item = navItemByHref.get(href)
          if (!item || !isNavItemVisible(href)) return null
          const desc = ERP_NAV_DASHBOARD_DESC[href]
          return {
            href,
            titleKey: item.titleKey,
            fallback: item.titleKey,
            descriptionKey: desc?.key || "adminDashboardLinkGenericDesc",
            descriptionFallback: desc?.fallback || tr("adminDashboardLinkGenericDesc", "즐겨찾기 바로가기"),
            icon: item.icon,
            primary: index === 0,
          }
        })
        .filter((link): link is NonNullable<typeof link> => Boolean(link)),
    [dashboardQuickHrefs, isNavItemVisible, navItemByHref, tr]
  )

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-4 px-3 py-4 sm:space-y-6 sm:px-6 sm:py-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex min-w-0 items-center gap-2">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10">
              <LayoutDashboard className="h-4 w-4 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-lg font-bold tracking-tight sm:text-xl">{tr("adminDashboard", "대시보드")}</h1>
              <p className="text-xs text-muted-foreground">
                {isLogisticsHome
                  ? tr("adminDashboardLogisticsSub", "물류 · 미승인 주문·입출고 현황")
                  : tr("adminDashboardHomeSub", "자주 쓰는 메뉴와 알림을 모아 둔 홈입니다.")}
              </p>
            </div>
          </div>
          <AdminDashboardPendingOrdersAlert count={dashboardStats.unapprovedOrders} />
        </div>

        {saasModuleLocked ? (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100"
          >
            <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="font-semibold">{tr("saasModuleLockedTitle", "구독에 포함되지 않은 기능입니다")}</p>
              <p className="text-xs leading-relaxed opacity-90">
                {tr(
                  "saasModuleLockedDesc",
                  "요청하신 메뉴는 현재 고객사 요금제에서 비활성화되어 있습니다. SaaS 관리자에게 모듈 활성화를 요청하세요."
                )}
              </p>
            </div>
            <button
              type="button"
              className="shrink-0 rounded-md p-1 opacity-70 transition-opacity hover:opacity-100"
              aria-label={tr("close", "닫기")}
              onClick={() => router.replace("/admin")}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        ) : null}

        {isLogisticsHome ? <AdminOperationsDashboardPanel /> : null}

        {quickLinks.length > 0 ? (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-foreground">
                {tr("adminDashboardQuickLinksTitle", "바로가기")}
              </h2>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5" onClick={() => setEditorOpen(true)}>
                <Pencil className="h-3.5 w-3.5" aria-hidden />
                {tr("erpNavFavoritesEdit", "바로가기 편집")}
              </Button>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quickLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`group rounded-xl border p-4 shadow-sm transition-colors hover:bg-muted/30 active:bg-muted/50 ${
                      link.primary ? "border-primary/30 bg-primary/5" : "border-border/70 bg-card"
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${
                          link.primary ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        <Icon className="h-5 w-5" aria-hidden />
                      </div>
                      <div className="min-w-0">
                        <p className="font-semibold text-foreground group-hover:text-primary">
                          {tr(link.titleKey, link.fallback)}
                        </p>
                        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                          {tr(link.descriptionKey, link.descriptionFallback)}
                        </p>
                      </div>
                    </div>
                  </Link>
                )
              })}
            </div>
            {!isLogisticsHome ? (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
                {tr(
                  "adminDashboardHomeHint",
                  "실시간 테이블·조리 현황은「실시간 매출」메뉴에서 확인하세요. 당일 완료 매출 차트도 같은 화면에 있습니다."
                )}
              </div>
            ) : null}
          </section>
        ) : null}
      </div>

      <ErpNavFavoritesEditor open={editorOpen} onOpenChange={setEditorOpen} />
    </div>
  )
}
