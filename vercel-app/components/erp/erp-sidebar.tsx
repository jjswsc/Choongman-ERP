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
} from "lucide-react"
import { Sidebar, SidebarContent, SidebarFooter, SidebarHeader, SidebarTrigger } from "@/components/ui/sidebar"
import { ScrollArea } from "@/components/ui/scroll-area"
import { cn } from "@/lib/utils"
import { useAuth } from "@/lib/auth-context"
import { useLang } from "@/lib/lang-context"
import { useT } from "@/lib/i18n"
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
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
} from "@/lib/permissions"
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
  { titleKey: "adminNotices", icon: Megaphone, href: "/admin/notices" },
  { titleKey: "adminWorkLog", icon: ClipboardList, href: "/admin/work-log" },
  { titleKey: "posCostAnalysis", icon: Calculator, href: "/admin/pos-cost-analysis" },
]

const menuSections: MenuSection[] = [
  {
    titleKey: "posMemberManage",
    items: [
      { titleKey: "memberList", icon: Users, href: "/admin/members" },
      { titleKey: "memberPoints", icon: Wallet, href: "/admin/members/points" },
      { titleKey: "memberCoupons", icon: Tag, href: "/admin/members/coupons" },
      { titleKey: "memberVisits", icon: CalendarDays, href: "/admin/members/visits" },
      { titleKey: "memberTiers", icon: TrendingUp, href: "/admin/members/tiers" },
    ],
  },
  {
    titleKey: "adminSectionSales",
    items: [
      { titleKey: "adminSalesManagement", icon: BarChart3, href: "/admin/sales-management" },
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
      { titleKey: "adminPosCoupons", icon: Tag, href: "/admin/pos-coupons" },
      { titleKey: "adminPosTaxInvoiceRecipients", icon: FileText, href: "/admin/pos-tax-invoice-recipients" },
    ],
  },
  {
    titleKey: "adminSectionHr",
    items: [
      { titleKey: "adminEmployees", icon: Users, href: "/admin/employees" },
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
      { titleKey: "adminInteriorEstimates", icon: FileText, href: "/admin/interior-estimates" },
      { titleKey: "adminInteriorExpense", icon: Wallet, href: "/admin/interior-expense" },
    ],
  },
]

const SIDEBAR_SECTIONS_STORAGE_KEY = "erp_sidebar_expanded_sections_v1"

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
  "/admin/pos-screen-config": canAccessPosTables, // 테이블/메뉴 통합
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

  const [expandedSections, setExpandedSections] = React.useState<Record<string, boolean>>(buildCollapsedSections)

  React.useEffect(() => {
    try {
      const raw = localStorage.getItem(SIDEBAR_SECTIONS_STORAGE_KEY)
      if (!raw) return
      const parsed = JSON.parse(raw) as unknown
      if (!parsed || typeof parsed !== "object") return
      setExpandedSections((prev) => {
        const next = { ...prev }
        for (const s of menuSections) {
          const v = (parsed as Record<string, unknown>)[s.titleKey]
          next[s.titleKey] = v === true
        }
        return next
      })
    } catch {
      /* ignore */
    }
  }, [])

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
              src="/img/logo.png"
              alt="CHOONGMAN CHICKEN"
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
              CHOONGMAN
            </h1>
            <p className="font-orbitron text-[11px] font-semibold text-white leading-tight drop-shadow-sm">
              ERP SYSTEM
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
                          <span className="truncate flex-1 group-data-[collapsible=icon]:hidden">
                            {t(item.titleKey)}
                          </span>
                          {item.badge !== undefined && Number(item.badge) > 0 && (
                            <span
                              className={cn(
                                "ml-auto flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-[10px] font-bold group-data-[collapsible=icon]:hidden",
                                item.badgeVariant === "destructive"
                                  ? "bg-destructive text-destructive-foreground"
                                  : item.badgeVariant === "warning"
                                  ? "bg-warning text-warning-foreground"
                                  : "bg-primary text-primary-foreground"
                              )}
                            >
                              {item.badge}
                            </span>
                          )}
                        </Link>
                      ))}
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
