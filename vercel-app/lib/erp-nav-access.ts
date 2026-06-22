import {
  canAccessAiCenter,
  canViewMobileStoreSales,
  canAccessPosCostAnalysis,
  canAccessPosCoupons,
  canAccessPosMenus,
  canAccessPosOrder,
  canAccessPosOrders,
  canAccessPosPrinters,
  canAccessPosSettlement,
  canAccessPosTables,
  canAccessPosTerminalSettings,
  canAccessSettings,
  isFranchiseeRole,
  isManagerRole,
  isPosOrderOnlyRole,
  isPosSettlementOnlyRole,
} from "@/lib/permissions"
import { resolveAdminPathSaasModule } from "@/lib/saas/erp-route-modules"
import { isSaasModuleEnabled, type SaasEnabledModulesMap } from "@/lib/use-saas-enabled-modules"
import {
  ERP_NAV_MAIN_ITEMS,
  ERP_NAV_MENU_SECTIONS,
  type ErpNavMenuItem,
  type ErpNavMenuSection,
} from "@/lib/erp-nav-registry"

/** 매니저에게 숨길 메뉴 href */
export const ERP_NAV_MANAGER_HIDDEN_HREFS = new Set(["/admin/items", "/admin/vendors"])

/** POS 메뉴별 href → 권한 체크 함수 */
export const ERP_NAV_POS_MENU_ACCESS: Record<string, (role: string, store?: string) => boolean> = {
  "/pos": canAccessPosOrder,
  "/admin/pos-orders": canAccessPosOrders,
  "/admin/pos-settlement": canAccessPosSettlement,
  "/admin/pos-cash": canAccessPosSettlement,
  "/admin/pos-tables": canAccessPosTables,
  "/admin/pos-menus": canAccessPosMenus,
  "/admin/pos-screen-config": (role) => canAccessPosTerminalSettings(role),
  "/admin/pos-cost-analysis": canAccessPosCostAnalysis,
  "/admin/pos-printers": (role, store) => canAccessPosPrinters(role, store),
  "/admin/pos-coupons": canAccessPosCoupons,
  "/admin/crm/coupons?tab=definitions": canAccessPosCoupons,
  "/admin/pos-tax-invoice-recipients": canAccessPosOrders,
}

export type ErpNavAccessContext = {
  role: string
  store?: string
  saasModules: SaasEnabledModulesMap | null
  aiModuleEnabled: boolean | null
}

export function isErpNavHrefAccessible(href: string, ctx: ErpNavAccessContext): boolean {
  const { role, store, saasModules, aiModuleEnabled } = ctx
  if (!isSaasModuleEnabled(saasModules, resolveAdminPathSaasModule(href))) return false
  if (href === "/admin/ai-center") {
    return canAccessAiCenter(role) && aiModuleEnabled !== false
  }
  if (href === "/admin/pos-cost-analysis") {
    return canAccessPosCostAnalysis(role)
  }
  if (href === "/admin/settings") {
    return canAccessSettings(role)
  }
  return true
}

export function filterErpNavSectionItems(
  section: ErpNavMenuSection,
  ctx: ErpNavAccessContext
): ErpNavMenuItem[] {
  const isManager = isManagerRole(ctx.role) || isFranchiseeRole(ctx.role)
  const isPosStaff = isPosOrderOnlyRole(ctx.role) || isPosSettlementOnlyRole(ctx.role)

  return section.items
    .filter((item) => !(isManager && ERP_NAV_MANAGER_HIDDEN_HREFS.has(item.href)))
    .filter((item) => {
      if (!isPosStaff) return isErpNavHrefAccessible(item.href, ctx)
      if (section.titleKey !== "adminSectionPos") return false
      const check = ERP_NAV_POS_MENU_ACCESS[item.href]
      return check ? check(ctx.role, ctx.store) && isErpNavHrefAccessible(item.href, ctx) : false
    })
}

export function getAccessibleErpNavMainItems(ctx: ErpNavAccessContext): ErpNavMenuItem[] {
  const isPosStaff = isPosOrderOnlyRole(ctx.role) || isPosSettlementOnlyRole(ctx.role)
  if (isPosStaff) return []
  return ERP_NAV_MAIN_ITEMS.filter((item) => isErpNavHrefAccessible(item.href, ctx))
}

export function getAccessibleErpNavSections(
  ctx: ErpNavAccessContext
): Array<{ section: ErpNavMenuSection; items: ErpNavMenuItem[] }> {
  return ERP_NAV_MENU_SECTIONS.map((section) => ({
    section,
    items: filterErpNavSectionItems(section, ctx),
  })).filter((entry) => entry.items.length > 0)
}

export function getAccessibleErpNavHrefs(ctx: ErpNavAccessContext): string[] {
  const hrefs = getAccessibleErpNavMainItems(ctx).map((item) => item.href)
  for (const entry of getAccessibleErpNavSections(ctx)) {
    for (const item of entry.items) {
      hrefs.push(item.href)
    }
  }
  if (canAccessSettings(ctx.role)) {
    hrefs.push("/admin/settings")
  }
  if (canViewMobileStoreSales(ctx.role)) {
    hrefs.push("/store-sales")
  }
  return hrefs
}
