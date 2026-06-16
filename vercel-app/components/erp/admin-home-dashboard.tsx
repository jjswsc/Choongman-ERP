"use client"

import Link from "next/link"
import { useSearchParams, useRouter } from "next/navigation"
import { Activity, BarChart3, LayoutDashboard, Lock, Radio, Smartphone, X } from "lucide-react"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { canViewMobileStoreSales, prefersLogisticsOperationsDashboard } from "@/lib/permissions"
import { useAdminDashboardStats } from "@/lib/use-admin-dashboard-stats"
import { AdminDashboardPendingOrdersAlert } from "@/components/erp/admin-dashboard-pending-orders-alert"
import { AdminOperationsDashboardPanel } from "@/components/erp/admin-operations-dashboard-panel"
import { Button } from "@/components/ui/button"

type QuickLink = {
  href: string
  titleKey: string
  fallback: string
  descriptionKey: string
  descriptionFallback: string
  icon: typeof Radio
  primary?: boolean
}

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
  const showMobileSales = Boolean(auth) && canViewMobileStoreSales(role)

  const quickLinks: QuickLink[] = [
    {
      href: "/admin/live-store-sales",
      titleKey: "adminLiveStoreSales",
      fallback: "실시간 매출",
      descriptionKey: "adminDashboardLinkLiveSalesDesc",
      descriptionFallback: "당일 매출·테이블·조리 진행 현황",
      icon: Radio,
      primary: true,
    },
    {
      href: "/admin/sales-management",
      titleKey: "adminSalesManagement",
      fallback: "매출 관리",
      descriptionKey: "adminDashboardLinkSalesMgmtDesc",
      descriptionFallback: "기간·채널·매장별 매출 분석",
      icon: BarChart3,
    },
    {
      href: "/admin/ops-center",
      titleKey: "adminOpsCenter",
      fallback: "운영 센터",
      descriptionKey: "adminDashboardLinkOpsDesc",
      descriptionFallback: "주문·결제·인쇄·마감 운영 KPI",
      icon: Activity,
    },
  ]

  if (showMobileSales) {
    quickLinks.push({
      href: "/store-sales",
      titleKey: "mobileStoreSalesTitle",
      fallback: "매장 실시간 매출",
      descriptionKey: "adminDashboardLinkMobileSalesDesc",
      descriptionFallback: "휴대폰용 매출·테이블 화면",
      icon: Smartphone,
    })
  }

  return (
    <div className="flex-1 overflow-auto">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-4">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10">
              <LayoutDashboard className="h-4 w-4 text-primary" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{tr("adminDashboard", "대시보드")}</h1>
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

        {isLogisticsHome ? (
          <AdminOperationsDashboardPanel />
        ) : (
          <section className="space-y-3">
            <h2 className="text-sm font-semibold text-foreground">
              {tr("adminDashboardQuickLinksTitle", "바로가기")}
            </h2>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {quickLinks.map((link) => {
                const Icon = link.icon
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={`group rounded-xl border p-4 shadow-sm transition-colors hover:bg-muted/30 ${
                      link.primary
                        ? "border-primary/30 bg-primary/5"
                        : "border-border/70 bg-card"
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
            <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
              {tr(
                "adminDashboardHomeHint",
                "실시간 테이블·조리 현황은「실시간 매출」메뉴에서 확인하세요. 당일 완료 매출 차트도 같은 화면에 있습니다."
              )}
            </div>
          </section>
        )}

        {isLogisticsHome ? (
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="secondary" size="sm">
              <Link href="/admin/live-store-sales">{tr("adminLiveStoreSales", "실시간 매출")}</Link>
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
