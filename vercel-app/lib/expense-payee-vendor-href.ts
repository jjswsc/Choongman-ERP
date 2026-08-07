/** Client-safe: open Vendor Management for bank account entry from an expense payee. */

const VENDOR_EDIT_INTENT_KEY = "erp_vendor_edit_intent_v1"

export type VendorEditIntent = {
  code?: string
  q?: string
  focusBank?: boolean
  at: number
}

export function expensePayeeVendorManageHref(payeeCode?: string | null, payeeName?: string | null): string {
  let code = String(payeeCode || "").trim()
  const marker = "::wm::"
  const idx = code.lastIndexOf(marker)
  if (idx >= 0) code = code.slice(0, idx).trim()
  if (code && !code.startsWith("auto_") && !/^card_\d+$/i.test(code)) {
    return `/admin/vendors?code=${encodeURIComponent(code)}&focus=bank`
  }
  const name = String(payeeName || "").trim()
  if (name) return `/admin/vendors?q=${encodeURIComponent(name)}&focus=bank`
  return "/admin/vendors?focus=bank"
}

/** Persist intent so keep-alive / same-URL re-entry still opens the vendor edit form. */
export function stashVendorEditIntent(payeeCode?: string | null, payeeName?: string | null): string {
  const href = expensePayeeVendorManageHref(payeeCode, payeeName)
  if (typeof window === "undefined") return href
  try {
    const url = new URL(href, window.location.origin)
    const intent: VendorEditIntent = {
      code: url.searchParams.get("code") || undefined,
      q: url.searchParams.get("q") || undefined,
      focusBank: url.searchParams.get("focus") === "bank",
      at: Date.now(),
    }
    sessionStorage.setItem(VENDOR_EDIT_INTENT_KEY, JSON.stringify(intent))
  } catch {
    /* ignore */
  }
  return href
}

export function consumeVendorEditIntent(): VendorEditIntent | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(VENDOR_EDIT_INTENT_KEY)
    if (!raw) return null
    sessionStorage.removeItem(VENDOR_EDIT_INTENT_KEY)
    const parsed = JSON.parse(raw) as VendorEditIntent
    if (!parsed || typeof parsed !== "object") return null
    // Ignore stale intents older than 5 minutes
    if (parsed.at && Date.now() - parsed.at > 5 * 60 * 1000) return null
    return parsed
  } catch {
    return null
  }
}

export function peekVendorEditIntent(): VendorEditIntent | null {
  if (typeof window === "undefined") return null
  try {
    const raw = sessionStorage.getItem(VENDOR_EDIT_INTENT_KEY)
    if (!raw) return null
    return JSON.parse(raw) as VendorEditIntent
  } catch {
    return null
  }
}
