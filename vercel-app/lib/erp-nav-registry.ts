import type { ElementType } from "react"
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
  ArrowLeftRight,
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
  Tag,
  Target,
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
  Settings,
  Smartphone,
} from "lucide-react"

export type ErpNavMenuItem = {
  titleKey: string
  icon: ElementType
  href: string
  badge?: number | string
  badgeVariant?: "default" | "destructive" | "warning"
}

export type ErpNavMenuSection = {
  titleKey: string
  items: ErpNavMenuItem[]
}

export const ERP_NAV_MAIN_ITEMS: ErpNavMenuItem[] = [
  { titleKey: "adminDashboard", icon: LayoutDashboard, href: "/admin" },
  { titleKey: "aiCenter", icon: Bot, href: "/admin/ai-center" },
  { titleKey: "adminNotices", icon: Megaphone, href: "/admin/notices" },
  { titleKey: "companyHybridDocuments", icon: FileText, href: "/admin/company-documents" },
  { titleKey: "adminWorkLog", icon: ClipboardList, href: "/admin/work-log" },
  { titleKey: "posCostAnalysis", icon: Calculator, href: "/admin/pos-cost-analysis" },
]

export const ERP_NAV_MENU_SECTIONS: ErpNavMenuSection[] = [
  {
    titleKey: "adminSectionCustomerCrm",
    items: [
      { titleKey: "adminCrmDashboard", icon: LayoutDashboard, href: "/admin/crm" },
      { titleKey: "memberList", icon: Users, href: "/admin/members" },
      { titleKey: "memberCoupons", icon: Tag, href: "/admin/crm/coupons" },
      { titleKey: "memberVisits", icon: CalendarDays, href: "/admin/members/visits" },
      { titleKey: "memberTiers", icon: TrendingUp, href: "/admin/members/tiers" },
      { titleKey: "adminCrmSegments", icon: Target, href: "/admin/crm/segments" },
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
      { titleKey: "marketingHomeTitle", icon: LayoutDashboard, href: "/admin/marketing" },
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
      { titleKey: "adminStoreOps", icon: LayoutDashboard, href: "/admin/store-ops" },
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
      { titleKey: "adminPosCash", icon: Banknote, href: "/admin/pos-cash" },
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
      { titleKey: "adminHrHome", icon: LayoutDashboard, href: "/admin/hr" },
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
      { titleKey: "adminReceivablePayable", icon: ArrowLeftRight, href: "/admin/receivable-payable" },
      { titleKey: "expenseManagementTitle", icon: Receipt, href: "/admin/expense-management" },
      { titleKey: "adminPettyCash", icon: HandCoins, href: "/admin/petty-cash" },
      { titleKey: "adminBankTransactions", icon: Landmark, href: "/admin/bank-transactions" },
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
  const items: ErpNavHelpItem[] = ERP_NAV_MAIN_ITEMS.map((m) => ({ href: m.href, titleKey: m.titleKey }))
  for (const s of ERP_NAV_MENU_SECTIONS) {
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

/** `getErpNavItemsForHelp()` 개수 = 사이드바(상단+섹션+설정)과 1:1. */
export const ERP_NAV_HELP_ITEM_COUNT = getErpNavItemsForHelp().length

export function getAllErpNavMenuItems(): ErpNavMenuItem[] {
  const items = [...ERP_NAV_MAIN_ITEMS]
  for (const section of ERP_NAV_MENU_SECTIONS) {
    items.push(...section.items)
  }
  return items
}

export function buildErpNavItemByHrefMap(): Map<string, ErpNavMenuItem> {
  const map = new Map<string, ErpNavMenuItem>()
  for (const item of getAllErpNavMenuItems()) {
    map.set(item.href, item)
  }
  map.set("/admin/settings", { titleKey: "adminSettings", icon: Settings, href: "/admin/settings" })
  map.set("/store-sales", { titleKey: "mobileStoreSalesTitle", icon: Smartphone, href: "/store-sales" })
  return map
}

/** 대시보드 카드 설명 — 알려진 href만 별도 문구, 나머지는 generic */
export const ERP_NAV_DASHBOARD_DESC: Record<string, { key: string; fallback: string }> = {
  "/admin/live-store-sales": {
    key: "adminDashboardLinkLiveSalesDesc",
    fallback: "당일 매출·테이블·조리 진행 현황",
  },
  "/admin/sales-management": {
    key: "adminDashboardLinkSalesMgmtDesc",
    fallback: "기간·채널·매장별 매출 분석",
  },
  "/admin/ops-center": {
    key: "adminDashboardLinkOpsDesc",
    fallback: "주문·결제·인쇄·마감 운영 KPI",
  },
  "/store-sales": {
    key: "adminDashboardLinkMobileSalesDesc",
    fallback: "휴대폰용 매출·테이블 화면",
  },
}
