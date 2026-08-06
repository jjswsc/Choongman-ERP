/** Client-safe: open Vendor Management for bank account entry from an expense payee. */
export function expensePayeeVendorManageHref(payeeCode?: string | null, payeeName?: string | null): string {
  let code = String(payeeCode || "").trim()
  const marker = "::wm::"
  const idx = code.lastIndexOf(marker)
  if (idx >= 0) code = code.slice(0, idx).trim()
  if (code && !code.startsWith("auto_") && !/^card_\d+$/i.test(code)) {
    return `/admin/vendors?code=${encodeURIComponent(code)}`
  }
  const name = String(payeeName || "").trim()
  if (name) return `/admin/vendors?q=${encodeURIComponent(name)}`
  return "/admin/vendors"
}
