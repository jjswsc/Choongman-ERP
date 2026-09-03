"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { LogOut, Settings, ChevronDown, ChevronRight, Star } from "lucide-react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT, tOr } from "@/lib/i18n"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { getInteriorDashboardSummary, getStoreOpsAlertSummary, type InteriorDashboardTotals, type StoreOpsAlertSummary } from "@/lib/api-client"
import {
  canAccessSettings,
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
  isLogisticsStaffRole,
  isManagerOrFranchiseeRole,
  isOfficeRole,
  isAccountingRole,
  isSupervisorRole,
} from "@/lib/permissions"
import { useAdminDashboardStats } from "@/lib/use-admin-dashboard-stats"
import {
  ERP_NAV_MENU_SECTIONS,
  buildErpNavItemByHrefMap,
  getErpNavItemsForHelp,
  ERP_NAV_HELP_ITEM_COUNT,
  type ErpNavHelpItem,
} from "@/lib/erp-nav-registry"
import { useErpNavAccess } from "@/lib/use-erp-nav-access"
import { isSaasModuleEnabled } from "@/lib/use-saas-enabled-modules"
import { useErpNavFavorites } from "@/lib/erp-nav-favorites-context"
import { useErpNavigationOptional } from "@/lib/erp-navigation"
import {
  getErpWorkspaceTabFullHref,
} from "@/lib/erp-workspace-tabs"
import { ErpSidebarNavRow } from "@/components/erp/erp-sidebar-nav-row"

export { getErpNavItemsForHelp, ERP_NAV_HELP_ITEM_COUNT, type ErpNavHelpItem }

const SIDEBAR_SECTIONS_STORAGE_KEY = "erp_sidebar_expanded_sections_v1"

function interiorNavBadge(
  href: string,
  totals: InteriorDashboardTotals
): { n: number; variant: "default" | "destructive" | "warning" } | null {
  if (href === "/admin/interior" && totals.projectsWithAnyAlert > 0) {
    return { n: totals.projectsWithAnyAlert, variant: "destructive" }
  }
  if (href === "/admin/interior/schedule" && totals.scheduleOverdueCount > 0) {
    return { n: totals.scheduleOverdueCount, variant: "warning" }
  }
  if (href === "/admin/interior/vendors" && totals.vendorDelayedCount > 0) {
    return { n: totals.vendorDelayedCount, variant: "warning" }
  }
  if (href === "/admin/interior/costs" && totals.overBudgetProjectCount > 0) {
    return { n: totals.overBudgetProjectCount, variant: "destructive" }
  }
  return null
}

function logisticsNavBadge(
  href: string,
  stats: { unapprovedOrders: number; leavePending: number; attPending: number }
): { n: number; variant: "default" | "destructive" | "warning" } | null {
  if (href === "/admin/orders" && stats.unapprovedOrders > 0) {
    return { n: stats.unapprovedOrders, variant: "destructive" }
  }
  if (href === "/admin/leave" && stats.leavePending > 0) {
    return { n: stats.leavePending, variant: "warning" }
  }
  if (href === "/admin/attendance" && stats.attPending > 0) {
    return { n: stats.attPending, variant: "warning" }
  }
  if (href === "/admin/hr") {
    const n = (stats.leavePending || 0) + (stats.attPending || 0)
    if (n > 0) return { n, variant: "warning" }
  }
  return null
}

function storeNavBadge(
  href: string,
  totals: { uncheckedToday: number; staleRepairs: number; openComplaints: number }
): { n: number; variant: "default" | "destructive" | "warning" } | null {
  if (href === "/admin/store-ops") {
    const n = totals.uncheckedToday + totals.staleRepairs + totals.openComplaints
    if (n > 0) return { n, variant: "warning" }
    return null
  }
  if (href === "/admin/store-check" && totals.uncheckedToday > 0) {
    return { n: totals.uncheckedToday, variant: "warning" }
  }
  if (href === "/admin/store-repairs" && totals.staleRepairs > 0) {
    return { n: totals.staleRepairs, variant: "destructive" }
  }
  if (href === "/admin/complaints" && totals.openComplaints > 0) {
    return { n: totals.openComplaints, variant: "destructive" }
  }
  return null
}

function buildCollapsedSections(): Record<string, boolean> {
  return Object.fromEntries(ERP_NAV_MENU_SECTIONS.map((s) => [s.titleKey, false])) as Record<string, boolean>
}

function isErpNavHrefActive(pathname: string, searchParams: URLSearchParams, href: string): boolean {
  const [path, query] = href.split("?")
  if (query) {
    if (pathname !== path) return false
    const params = new URLSearchParams(query)
    for (const [key, value] of params.entries()) {
      if (searchParams.get(key) !== value) return false
    }
    return true
  }
  return pathname === href
}

export function ErpSidebar() {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const erpNav = useErpNavigationOptional()
  const router = useRouter()

  /** soft 탭 전환 시 Next pathname과 달라도 사이드바 활성 표시를 맞춤 */
  const { navPathname, navSearchParams } = React.useMemo(() => {
    const soft = erpNav?.softDisplayHref
    if (!soft) return { navPathname: pathname, navSearchParams: searchParams }
    const full = getErpWorkspaceTabFullHref(soft)
    const q = full.indexOf("?")
    if (q < 0) {
      return { navPathname: full, navSearchParams: new URLSearchParams() }
    }
    return {
      navPathname: full.slice(0, q),
      navSearchParams: new URLSearchParams(full.slice(q + 1)),
    }
  }, [erpNav?.softDisplayHref, pathname, searchParams])

  const { auth, logout } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const tr = (key: string, fallback: string) => tOr(t, key, fallback)
  const brand = useAppBrandConfig()
  const showSettings = canAccessSettings(auth?.role || "", brand.key)
  const isPosStaff = isPosOrderOnlyRole(auth?.role || "") || isPosSettlementOnlyRole(auth?.role || "")
  const hasManagerScope = isManagerOrFranchiseeRole(auth?.role || "", brand.key) || isOfficeRole(auth?.role || "", brand.key) || isAccountingRole(auth?.role || "") || isSupervisorRole(auth?.role || "")
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>(buildCollapsedSections)
  const [interiorDashTotals, setInteriorDashTotals] = React.useState<InteriorDashboardTotals | null>(null)
  const [storeOpsTotals, setStoreOpsTotals] = React.useState<StoreOpsAlertSummary | null>(null)
  const { stats: dashboardStats } = useAdminDashboardStats()
  const isLogisticsStaff = isLogisticsStaffRole(auth?.role || "")
  const { mainItems, sections, isNavItemVisible, saasModules } = useErpNavAccess()
  const { favoriteHrefs } = useErpNavFavorites()
  const navItemByHref = React.useMemo(() => buildErpNavItemByHrefMap(), [])

  const favoriteItems = React.useMemo(
    () =>
      favoriteHrefs
        .map((href) => navItemByHref.get(href))
        .filter((item): item is NonNullable<typeof item> => Boolean(item && isNavItemVisible(item.href))),
    [favoriteHrefs, isNavItemVisible, navItemByHref]
  )

  React.useEffect(() => {
    if (!isSaasModuleEnabled(saasModules, "logistics")) {
      setInteriorDashTotals(null)
      return
    }
    let cancelled = false
    getInteriorDashboardSummary()
      .then((s) => {
        if (!cancelled && s?.totals) setInteriorDashTotals(s.totals)
      })
      .catch(() => {
        if (!cancelled) setInteriorDashTotals(null)
      })
    return () => {
      cancelled = true
    }
  }, [saasModules])

  React.useEffect(() => {
    if (!hasManagerScope || !isSaasModuleEnabled(saasModules, "store_ops")) {
      setStoreOpsTotals(null)
      return
    }
    let cancelled = false
    getStoreOpsAlertSummary()
      .then((s) => {
        if (!cancelled) setStoreOpsTotals(s)
      })
      .catch(() => {
        if (!cancelled) setStoreOpsTotals(null)
      })
    return () => {
      cancelled = true
    }
  }, [hasManagerScope, saasModules])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== "object") return
      setExpandedSections((prev) => {
        const next = { ...prev }
        for (const s of ERP_NAV_MENU_SECTIONS) {
          const stored = parsed as Record<string, unknown>
          const v = stored[s.titleKey]
          const legacyExpanded =
            s.titleKey === "adminSectionCustomerCrm" &&
            (stored.posMemberManage === true || stored.adminSectionCrm === true)
          next[s.titleKey] = v === true || legacyExpanded
        }
        return next
      })
    } catch {
      /* ignore */
    }
  }, [])

  React.useEffect(() => {
    if (!navPathname.startsWith("/admin/members") && !navPathname.startsWith("/admin/crm")) return
    setExpandedSections((prev) => {
      if (prev.adminSectionCustomerCrm === true) return prev
      const next = { ...prev, adminSectionCustomerCrm: true }
      try {
        localStorage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [navPathname])

  React.useEffect(() => {
    if (!navPathname.startsWith("/admin/marketing")) return
    setExpandedSections((prev) => {
      if (prev.adminSectionMarketing === true) return prev
      const next = { ...prev, adminSectionMarketing: true }
      try {
        localStorage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [navPathname])

  React.useEffect(() => {
    if (
      !navPathname.startsWith("/admin/store-ops") &&
      !navPathname.startsWith("/admin/store-check") &&
      !navPathname.startsWith("/admin/store-visit") &&
      !navPathname.startsWith("/admin/store-repairs") &&
      !navPathname.startsWith("/admin/complaints")
    ) {
      return
    }
    setExpandedSections((prev) => {
      if (prev.adminSectionStore === true) return prev
      const next = { ...prev, adminSectionStore: true }
      try {
        localStorage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [navPathname])

  React.useEffect(() => {
    if (!isLogisticsStaff) return
    setExpandedSections((prev) => {
      if (prev.adminSectionLogistics === true) return prev
      const next = { ...prev, adminSectionLogistics: true }
      try {
        localStorage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [isLogisticsStaff])

  React.useEffect(() => {
    if (!navPathname.startsWith("/admin/interior")) return
    setExpandedSections((prev) => {
      if (prev.adminSectionInterior === true) return prev
      const next = { ...prev, adminSectionInterior: true }
      try {
        localStorage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }, [navPathname])

  const toggleSection = (titleKey: string) => {
    setExpandedSections((prev) => {
      const next = { ...prev, [titleKey]: !prev[titleKey] }
      try {
        localStorage.setItem(SIDEBAR_SECTIONS_STORAGE_KEY, JSON.stringify(next))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  const handleLogout = () => {
    logout()
    router.replace("/admin/login")
  }

  const renderBadge = (
    badgeVal: number | string | undefined,
    badgeVariantEff: "default" | "destructive" | "warning" | undefined
  ) => {
    if (badgeVal === undefined || Number(badgeVal) <= 0) return null
    return (
      <span
        className={cn(
          "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold group-data-[collapsible=icon]:hidden",
          badgeVariantEff === "destructive"
            ? "bg-destructive text-destructive-foreground"
            : badgeVariantEff === "warning"
              ? "bg-warning text-warning-foreground"
              : "bg-primary text-primary-foreground"
        )}
      >
        {badgeVal}
      </span>
    )
  }

  return (
    <Sidebar collapsible="icon" className="border-r-0 print:hidden sidebar-dark">
      <SidebarHeader className="px-3 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-3 group-data-[collapsible=icon]:justify-center">
          <div className="relative flex h-9 w-9 flex-shrink-0 items-center justify-center overflow-hidden rounded-lg bg-transparent">
            <Image
              src={brand.logoSymbolSrc}
              alt={brand.logoAlt}
              width={36}
              height={36}
              className="object-contain"
              unoptimized
              onError={(e) => {
                const img = e.target as HTMLImageElement
                img.style.display = "none"
                const fallback = img.closest("div")?.querySelector("svg")
                if (fallback instanceof HTMLElement) fallback.style.display = "block"
              }}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5 text-primary-foreground" style={{ display: "none" }}>
              <path d="M3 3v18h18" />
              <path d="M18 9V3" />
              <path d="M3 15l6-6 4 4 8-8" />
            </svg>
          </div>
          <div className="flex flex-col min-w-0 group-data-[collapsible=icon]:hidden">
            <h1 className="font-orbitron text-sm font-bold text-white tracking-wide leading-tight drop-shadow-sm">
              {brand.key === "omnifoodtech" ? "OMNIFOODTECH" : "CHOONGMAN"}
            </h1>
            <p className="font-orbitron text-[11px] font-semibold text-white leading-tight drop-shadow-sm">
              {brand.key === "omnifoodtech" ? "AI ERP PLATFORM" : "ERP SYSTEM"}
            </p>
          </div>
          <SidebarTrigger className="ml-auto h-8 w-8 shrink-0 rounded-md text-white/80 hover:bg-sidebar-accent hover:text-white md:hidden" />
        </div>
      </SidebarHeader>

      <SidebarContent className="flex-1 overflow-hidden px-2 pb-4">
        <ScrollArea className="h-full [&_[data-slot=scroll-area-viewport]]:pr-3">
          <nav className="space-y-1">
            {favoriteItems.length > 0 ? (
              <div className="mb-3 space-y-0.5 rounded-lg border border-white/10 bg-white/[0.04] px-1 py-1.5 group-data-[collapsible=icon]:mb-2 group-data-[collapsible=icon]:border-0 group-data-[collapsible=icon]:bg-transparent group-data-[collapsible=icon]:p-0">
                <div className="flex items-center gap-1.5 px-2 py-1 text-[11px] font-semibold uppercase tracking-wide text-white/70 group-data-[collapsible=icon]:hidden">
                  <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" aria-hidden />
                  {tr("erpNavFavorites", "즐겨찾기")}
                </div>
                {favoriteItems.map((item) => (
                  <ErpSidebarNavRow
                    key={`fav-${item.href}`}
                    item={item}
                    pathname={navPathname}
                    active={isErpNavHrefActive(navPathname, navSearchParams, item.href)}
                    showFavoriteToggle
                  />
                ))}
              </div>
            ) : null}

            {!isPosStaff && mainItems.length > 0 ? (
              <div className="mb-1 space-y-0.5">
                {mainItems.map((item) => (
                  <ErpSidebarNavRow
                    key={item.href}
                    item={item}
                    pathname={navPathname}
                    active={isErpNavHrefActive(navPathname, navSearchParams, item.href)}
                  />
                ))}
              </div>
            ) : null}

            {sections.map(({ section, items: visibleItems }) => {
              const isExpanded = expandedSections[section.titleKey] ?? false
              return (
                <div key={section.titleKey} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.titleKey)}
                    className="flex w-full items-center justify-between rounded-r border-l-2 border-sidebar-foreground/50 bg-sidebar-accent/30 px-3 py-2 text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-white transition-colors group-data-[collapsible=icon]:hidden"
                  >
                    {t(section.titleKey)}
                    {isExpanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                  </button>
                  {isExpanded ? (
                    <div className="space-y-0.5">
                      {visibleItems.map((item) => {
                        const interiorExtra =
                          section.titleKey === "adminSectionInterior" && interiorDashTotals
                            ? interiorNavBadge(item.href, interiorDashTotals)
                            : null
                        const logisticsExtra =
                          section.titleKey === "adminSectionLogistics" || section.titleKey === "adminSectionHr"
                            ? logisticsNavBadge(item.href, dashboardStats)
                            : null
                        const storeExtra =
                          section.titleKey === "adminSectionStore" && storeOpsTotals
                            ? storeNavBadge(item.href, storeOpsTotals)
                            : null
                        const badgeVal = logisticsExtra?.n ?? interiorExtra?.n ?? storeExtra?.n ?? item.badge
                        const badgeVariantEff =
                          logisticsExtra?.variant ?? interiorExtra?.variant ?? storeExtra?.variant ?? item.badgeVariant
                        return (
                          <ErpSidebarNavRow
                            key={item.href}
                            item={item}
                            pathname={navPathname}
                            active={isErpNavHrefActive(navPathname, navSearchParams, item.href)}
                            badge={renderBadge(badgeVal, badgeVariantEff)}
                          />
                        )
                      })}
                    </div>
                  ) : null}
                </div>
              )
            })}
          </nav>
        </ScrollArea>
      </SidebarContent>

      <SidebarFooter className="px-3 py-3 border-t border-sidebar-border">
        <div className="space-y-0.5">
          {showSettings && navItemByHref.get("/admin/settings") ? (
            <ErpSidebarNavRow
              item={navItemByHref.get("/admin/settings")!}
              pathname={navPathname}
              active={navPathname === "/admin/settings"}
            />
          ) : null}
          <button
            type="button"
            onClick={handleLogout}
            className="flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] text-destructive hover:bg-destructive/10 transition-colors w-full"
          >
            <LogOut className="h-4 w-4 flex-shrink-0" />
            <span className="truncate group-data-[collapsible=icon]:hidden">{t("logout")}</span>
          </button>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
