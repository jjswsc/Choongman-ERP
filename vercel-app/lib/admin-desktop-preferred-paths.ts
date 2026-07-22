/**
 * 폰에서 전면 반응형 대신 PC 권장 안내만 띄울 `/admin` 경로.
 * prefix 매칭 (예: `/admin/stock` → 재고 매트릭스 포함).
 */
export const ADMIN_DESKTOP_PREFERRED_PATH_PREFIXES = [
  "/admin/stock",
  "/admin/financial-statements",
  "/admin/balance-sheet",
  "/admin/income-statement",
  "/admin/tax-filing",
  "/admin/chart-of-accounts",
  "/admin/depreciation",
  "/admin/pos-menus",
  "/admin/pos-printers",
  "/admin/pos-screen-config",
  "/admin/payroll",
  "/admin/accounting-compliance",
  "/admin/bank-transactions",
  "/admin/receivable-payable",
  "/admin/items",
  "/admin/interior",
  "/admin/pos-cost-analysis",
  "/admin/total-sales",
  "/admin/sales-management",
] as const

export function isAdminDesktopPreferredPath(pathname: string): boolean {
  const path = (pathname || "").split("?")[0].replace(/\/+$/, "") || "/admin"
  return ADMIN_DESKTOP_PREFERRED_PATH_PREFIXES.some(
    (prefix) => path === prefix || path.startsWith(`${prefix}/`)
  )
}
