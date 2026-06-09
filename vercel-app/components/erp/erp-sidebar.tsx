"use client"

import * as React from "react"
import Link from "next/link"
import Image from "next/image"
import { usePathname, useRouter } from "next/navigation"
import {
  LayoutDashboard,
  LayoutGrid,
  Megaphone,
  ClipboardList,
  Package,
  ShoppingCart,
  Building2,
  ClipboardCheck,
  BarChart3,
  Layers,
  ArrowDownToLine,
  ArrowUpFromLine,
  Users,
  CalendarClock,
  CalendarDays,
  FileText,
  Wallet,
  Banknote,
  Palmtree,
  Printer,
  Receipt,
  Store,
  MapPin,
  MessageSquareWarning,
  Settings,
  LogOut,
  ChevronDown,
  ChevronRight,
  Tag,
  TrendingUp,
  Calculator,
  Settings2,
  Wrench,
  Landmark,
  GitBranch,
  Handshake,
  Bot,
  Calendar,
  HandCoins,
  LayoutPanelTop,
  PackageSearch,
  UtensilsCrossed,
  BookOpen,
  Radio,
} from "lucide-react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
import { useAppBrandConfig } from "@/components/app-brand-provider"
import { getInteriorDashboardSummary, type InteriorDashboardTotals } from "@/lib/api-client"
import {
  isManagerRole,
  isFranchiseeRole,
  canAccessSettings,
  canAccessPosOrder,
  canAccessPosSettlement,
  canAccessPosOrders,
  canAccessPosTables,
  canAccessPosMenus,
  canAccessPosCostAnalysis,
  canAccessPosPrinters,
  canAccessPosCoupons,
  canManageAttendanceQrDevices,
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
  canAccessAiCenter,
  isLogisticsStaffRole,
} from "@/lib/permissions"
import { useAdminDashboardStats } from "@/lib/use-admin-dashboard-stats"
interface MenuItem {
  titleKey: string
  icon: React.ElementType
  href: string
  badge?: number | string
  badgeVariant?: "default" | "destructive" | "warning"
}

interface MenuSection {
  titleKey: string
  items: MenuItem[]
}

const mainItems: MenuItem[] = [
  { titleKey: "adminDashboard", icon: LayoutDashboard, href: "/admin" },
  { titleKey: "aiCenter", icon: Bot, href: "/admin/ai-center" },
  { titleKey: "adminNotices", icon: Megaphone, href: "/admin/notices" },
  { titleKey: "companyHybridDocuments", icon: FileText, href: "/admin/company-documents" },
  { titleKey: "adminWorkLog", icon: ClipboardList, href: "/admin/work-log" },
  { titleKey: "posCostAnalysis", icon: Calculator, href: "/admin/pos-cost-analysis" },
]

const menuSections: MenuSection[] = [
  {
    titleKey: "adminSectionCustomerCrm",
    items: [
      { titleKey: "adminCrmDashboard", icon: LayoutDashboard, href: "/admin/crm" },
      { titleKey: "memberList", icon: Users, href: "/admin/members" },
      { titleKey: "memberPoints", icon: Wallet, href: "/admin/members/points" },
      { titleKey: "memberCoupons", icon: Tag, href: "/admin/crm/coupons" },
      { titleKey: "memberVisits", icon: CalendarDays, href: "/admin/members/visits" },
      { titleKey: "memberTiers", icon: TrendingUp, href: "/admin/members/tiers" },
      { titleKey: "adminCrmSegments", icon: Users, href: "/admin/crm/segments" },
      { titleKey: "memberAppContent", icon: LayoutPanelTop, href: "/admin/crm/member-app" },
    ],
  },
  {
    titleKey: "adminSectionSales",
    items: [
      { titleKey: "adminLiveStoreSales", icon: Radio, href: "/admin/live-store-sales" },
      { titleKey: "adminOpsCenter", icon: LayoutDashboard, href: "/admin/ops-center" },
      { titleKey: "adminSalesManagement", icon: BarChart3, href: "/admin/sales-management" },
      { titleKey: "adminTotalSales", icon: Layers, href: "/admin/total-sales" },
    ],
  },
  {
    titleKey: "adminSectionMarketing",
    items: [
      { titleKey: "adminMarketingCampaigns", icon: Megaphone, href: "/admin/marketing/campaigns" },
      { titleKey: "adminMarketingCollabMenus", icon: Handshake, href: "/admin/marketing/collab-menus" },
      { titleKey: "adminMarketingPromos", icon: Tag, href: "/admin/marketing/promos" },
      { titleKey: "adminMarketingAds", icon: TrendingUp, href: "/admin/marketing/ads" },
      { titleKey: "adminMarketingInfluencers", icon: Users, href: "/admin/marketing/influencers" },
      { titleKey: "adminMarketingMaterials", icon: Package, href: "/admin/marketing/materials" },
      { titleKey: "adminMarketingCalendar", icon: CalendarDays, href: "/admin/marketing/calendar" },
      { titleKey: "adminMarketingReport", icon: FileText, href: "/admin/marketing/report" },
      { titleKey: "adminMarketingIntegrations", icon: Settings2, href: "/admin/marketing/integrations" },
    ],
  },
  {
    titleKey: "adminSectionStore",
    items: [
      { titleKey: "adminStoreCheck", icon: Store, href: "/admin/store-check" },
      { titleKey: "adminStoreVisit", icon: MapPin, href: "/admin/store-visit" },
      { titleKey: "adminStoreRepairs", icon: Wrench, href: "/admin/store-repairs" },
      { titleKey: "adminComplaints", icon: MessageSquareWarning, href: "/admin/complaints" },
    ],
  },
  {
    titleKey: "adminSectionPos",
    items: [
      { titleKey: "adminPosOrder", icon: ShoppingCart, href: "/pos" },
      { titleKey: "adminPosOrderList", icon: Receipt, href: "/admin/pos-orders" },
      { titleKey: "adminPosSettlement", icon: Wallet, href: "/admin/pos-settlement" },
      { titleKey: "adminPosCash", icon: Wallet, href: "/admin/pos-cash" },
      { titleKey: "adminPosScreenConfig", icon: LayoutGrid, href: "/admin/pos-screen-config" },
      { titleKey: "adminPosMenus", icon: Package, href: "/admin/pos-menus" },
      { titleKey: "adminPosPrinters", icon: Printer, href: "/admin/pos-printers" },
      { titleKey: "adminPosCoupons", icon: Tag, href: "/admin/crm/coupons?tab=definitions" },
      { titleKey: "adminPosTaxInvoiceRecipients", icon: FileText, href: "/admin/pos-tax-invoice-recipients" },
    ],
  },
  {
    titleKey: "adminSectionHr",
    items: [
      { titleKey: "adminEmployees", icon: Users, href: "/admin/employees" },
      { titleKey: "adminHrPolicies", icon: BookOpen, href: "/admin/hr-policies" },
      { titleKey: "adminHrCalendar", icon: CalendarDays, href: "/admin/hr-calendar" },
      { titleKey: "adminAttendance", icon: CalendarClock, href: "/admin/attendance" },
      { titleKey: "adminLeave", icon: Palmtree, href: "/admin/leave", badge: 0, badgeVariant: "warning" },
    ],
  },
  {
    titleKey: "adminSectionLogistics",
    items: [
      { titleKey: "adminItems", icon: Package, href: "/admin/items" },
      { titleKey: "adminVendors", icon: Building2, href: "/admin/vendors" },
      { titleKey: "adminOrders", icon: ClipboardCheck, href: "/admin/orders", badge: 0, badgeVariant: "destructive" },
      { titleKey: "adminOrderCreate", icon: ShoppingCart, href: "/admin/order-create" },
      { titleKey: "adminStock", icon: BarChart3, href: "/admin/stock" },
      { titleKey: "adminInbound", icon: ArrowDownToLine, href: "/admin/inbound" },
      { titleKey: "adminOutbound", icon: ArrowUpFromLine, href: "/admin/outbound" },
    ],
  },
  {
    titleKey: "adminSectionAccounting",
    items: [
      { titleKey: "adminAccountingPurchaseOrder", icon: FileText, href: "/admin/accounting/purchase-order" },
      { titleKey: "adminPayroll", icon: Wallet, href: "/admin/payroll" },
      { titleKey: "adminReceivablePayable", icon: Banknote, href: "/admin/receivable-payable" },
      { titleKey: "expenseManagementTitle", icon: Wallet, href: "/admin/expense-management" },
      { titleKey: "adminPettyCash", icon: Receipt, href: "/admin/petty-cash" },
      { titleKey: "adminBankTransactions", icon: Banknote, href: "/admin/bank-transactions" },
      { titleKey: "adminDepreciation", icon: Calculator, href: "/admin/depreciation" },
      { titleKey: "adminFinancialStatements", icon: TrendingUp, href: "/admin/financial-statements" },
      { titleKey: "adminChartOfAccounts", icon: GitBranch, href: "/admin/chart-of-accounts" },
      { titleKey: "adminTaxFiling", icon: Landmark, href: "/admin/tax-filing" },
    ],
  },
  {
    titleKey: "adminSectionInterior",
    items: [
      { titleKey: "adminInteriorProjects", icon: LayoutGrid, href: "/admin/interior" },
      { titleKey: "interiorSchedule", icon: Calendar, href: "/admin/interior/schedule" },
      { titleKey: "interiorVendorsHub", icon: HandCoins, href: "/admin/interior/vendors" },
      { titleKey: "interiorHubSpecs", icon: PackageSearch, href: "/admin/interior/specs" },
      { titleKey: "interiorHubDrawings", icon: LayoutPanelTop, href: "/admin/interior/drawings" },
      { titleKey: "interiorKitchen", icon: UtensilsCrossed, href: "/admin/interior/kitchen" },
      { titleKey: "interiorHubCosts", icon: Wallet, href: "/admin/interior/costs" },
    ],
  },
]

export type ErpNavHelpItem = { href: string; titleKey: string; sectionTitleKey?: string }

/** 사이드바 메뉴 기준 — 도움말 센터·PageHelp가 동일 href/titleKey를 쓰도록 한다. */
export function getErpNavItemsForHelp(): ErpNavHelpItem[] {
  const items: ErpNavHelpItem[] = mainItems.map((m) => ({ href: m.href, titleKey: m.titleKey }))
  for (const s of menuSections) {
    for (const it of s.items) {
      items.push({ href: it.href, titleKey: it.titleKey, sectionTitleKey: s.titleKey })
    }
  }
  items.push({
    href: "/admin/settings",
    titleKey: "adminSettings",
    sectionTitleKey: "adminHelpGroupSettings",
  })
  return items
}

/** `getErpNavItemsForHelp()` 개수 = 사이드바(상단+섹션+설정)과 1:1. 도움말 `helpSum_*`·도움말 센터 항목 수와 맞출 것. */
export const ERP_NAV_HELP_ITEM_COUNT = getErpNavItemsForHelp().length

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
  stats: { unapprovedOrders: number; leavePending: number }
): { n: number; variant: "default" | "destructive" | "warning" } | null {
  if (href === "/admin/orders" && stats.unapprovedOrders > 0) {
    return { n: stats.unapprovedOrders, variant: "destructive" }
  }
  if (href === "/admin/leave" && stats.leavePending > 0) {
    return { n: stats.leavePending, variant: "warning" }
  }
  return null
}

function buildCollapsedSections(): Record<string, boolean> {
  return Object.fromEntries(menuSections.map((s) => [s.titleKey, false])) as Record<string, boolean>
}

/** 매니저에게 숨길 메뉴 href */
const MANAGER_HIDDEN_HREFS = new Set(["/admin/items", "/admin/vendors"])

/** POS 메뉴별 href → 권한 체크 함수 */
const POS_MENU_ACCESS: Record<string, (role: string) => boolean> = {
  "/pos": canAccessPosOrder,
  "/admin/pos-orders": canAccessPosOrders,
  "/admin/pos-settlement": canAccessPosSettlement,
  "/admin/pos-cash": canAccessPosSettlement,
  "/admin/pos-tables": canAccessPosTables,
  "/admin/pos-menus": canAccessPosMenus,
  "/admin/pos-screen-config": (role) => canAccessPosTables(role) || canManageAttendanceQrDevices(role),
  "/admin/pos-cost-analysis": canAccessPosCostAnalysis,
  "/admin/pos-printers": canAccessPosPrinters,
  "/admin/pos-coupons": canAccessPosCoupons,
  "/admin/pos-tax-invoice-recipients": canAccessPosOrders,
}

export function ErpSidebar() {
  const pathname = usePathname()
  const router = useRouter()
  const { auth, logout } = useAuth()
  const { lang } = useLang()
  const t = useT(lang)
  const isManager = isManagerRole(auth?.role || "") || isFranchiseeRole(auth?.role || "")
  const showSettings = canAccessSettings(auth?.role || "")
  const isPosStaff = isPosOrderOnlyRole(auth?.role || "") || isPosSettlementOnlyRole(auth?.role || "")
  const brand = useAppBrandConfig()
  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>(buildCollapsedSections)
  const [interiorDashTotals, setInteriorDashTotals] = React.useState<InteriorDashboardTotals | null>(null)
  const { stats: dashboardStats } = useAdminDashboardStats({ poll: true })
  const isLogisticsStaff = isLogisticsStaffRole(auth?.role || "")

  React.useEffect(() => {
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
  }, [])

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== "object") return
      setExpandedSections((prev) => {
        const next = { ...prev }
        for (const s of menuSections) {
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

  /** 고객 CRM 화면에 있을 때 해당 섹션을 펼침 */
  React.useEffect(() => {
    if (!pathname.startsWith("/admin/members") && !pathname.startsWith("/admin/crm")) return
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
  }, [pathname])

  /** 물류 담당 로그인 시 물류 섹션 자동 펼침 */
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

  /** 인테리어 화면에 있을 때 사이드바 인테리어 섹션을 펼쳐 하위 항목이 보이게 함 */
  React.useEffect(() => {
    if (!pathname.startsWith("/admin/interior")) return
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
  }, [pathname])

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

  return (
    <Sidebar collapsible="icon" className="border-r-0 print:hidden sidebar-dark">
      {/* Logo */}
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

      {/* Navigation */}
      <SidebarContent className="flex-1 overflow-y-auto px-2 pb-4">
        <ScrollArea className="h-full">
          <nav className="space-y-1">
            {/* Top-level (no section title) - POS 직원은 숨김 */}
            {!isPosStaff && (
            <div className="mb-1">
              <div className="space-y-0.5">
                {mainItems
                  .filter((item) => item.href !== "/admin/pos-cost-analysis" || canAccessPosCostAnalysis(auth?.role || ""))
                  .filter((item) => item.href !== "/admin/ai-center" || canAccessAiCenter(auth?.role || ""))
                  .map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors",
                      pathname === item.href
                        ? "bg-primary text-primary-foreground font-medium shadow-sm"
                        : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                    )}
                  >
                    <item.icon className="h-4 w-4 flex-shrink-0" />
                    <span className="truncate group-data-[collapsible=icon]:hidden">{t(item.titleKey)}</span>
                  </Link>
                ))}
              </div>
            </div>
            )}

            {/* Grouped sections */}
            {menuSections.map((section) => {
              const isExpanded = expandedSections[section.titleKey] ?? false
              return (
                <div key={section.titleKey} className="mb-1">
                  <button
                    type="button"
                    onClick={() => toggleSection(section.titleKey)}
                    className="flex w-full items-center justify-between rounded-r border-l-2 border-sidebar-foreground/50 bg-sidebar-accent/30 px-3 py-2 text-[13px] font-medium text-sidebar-foreground hover:bg-sidebar-accent/50 hover:text-white transition-colors group-data-[collapsible=icon]:hidden"
                  >
                    {t(section.titleKey)}
                    {isExpanded ? (
                      <ChevronDown className="h-3 w-3" />
                    ) : (
                      <ChevronRight className="h-3 w-3" />
                    )}
                  </button>
                  {isExpanded && (
                    <div className="space-y-0.5">
                      {section.items
                        .filter((item) => !(isManager && MANAGER_HIDDEN_HREFS.has(item.href)))
                        .filter((item) => {
                          if (!isPosStaff) return true
                          if (section.titleKey !== "adminSectionPos") return false
                          const check = POS_MENU_ACCESS[item.href]
                          return check ? check(auth?.role || "") : false
                        })
                        .map((item) => {
                        const interiorExtra =
                          section.titleKey === "adminSectionInterior" && interiorDashTotals
                            ? interiorNavBadge(item.href, interiorDashTotals)
                            : null
                        const logisticsExtra =
                          section.titleKey === "adminSectionLogistics" ||
                          section.titleKey === "adminSectionHr"
                            ? logisticsNavBadge(item.href, dashboardStats)
                            : null
                        const badgeVal = logisticsExtra?.n ?? interiorExtra?.n ?? item.badge
                        const badgeVariantEff = logisticsExtra?.variant ?? interiorExtra?.variant ?? item.badgeVariant
                        return (
                        <Link
                          key={item.href}
                          href={item.href}
                          className={cn(
                            "flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors",
                            pathname === item.href
                              ? "bg-primary text-primary-foreground font-medium shadow-sm"
                              : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
                          )}
                        >
                          <item.icon className="h-4 w-4 flex-shrink-0" />
                          <span className="truncate flex-1 group-data-[collapsible=icon]:hidden">
                            {t(item.titleKey)}
                          </span>
                          {badgeVal !== undefined && Number(badgeVal) > 0 && (
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
                          )}
                        </Link>
                      )})}
                    </div>
                  )}
                </div>
              )
            })}

          </nav>
        </ScrollArea>
      </SidebarContent>

      {/* Footer */}
      <SidebarFooter className="px-3 py-3 border-t border-sidebar-border">
        <div className="space-y-0.5">
          {showSettings && (
            <Link
              href="/admin/settings"
              className={cn(
                "flex w-full items-center gap-2.5 rounded px-3 py-2 text-[13px] transition-colors",
                pathname === "/admin/settings"
                  ? "bg-primary text-primary-foreground font-medium shadow-sm"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-white"
              )}
            >
              <Settings className="h-4 w-4 flex-shrink-0" />
              <span className="truncate group-data-[collapsible=icon]:hidden">{t("adminSettings")}</span>
            </Link>
          )}
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
