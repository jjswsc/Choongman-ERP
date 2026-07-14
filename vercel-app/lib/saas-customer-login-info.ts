import { isFranchiseeRole, isManagerRole } from "@/lib/permissions"

export type SaasCustomerLoginAccount = {
  id: number
  company: string
  store: string
  name: string
  role: string
}

export function isCustomerErpAdminLoginRole(role: string): boolean {
  const r = String(role || "").trim()
  if (!r) return false
  const lower = r.toLowerCase()
  if (isManagerRole(r) || isFranchiseeRole(r)) return true
  return (
    lower.includes("officer") ||
    lower.includes("director") ||
    lower.includes("accounting") ||
    lower.includes("supervisor") ||
    lower.includes("ceo") ||
    lower.includes("hr")
  )
}

export function pickSaasCustomerLoginAccounts(
  rows: Array<{
    id?: number
    company?: string
    store?: string
    name?: string
    role?: string
    resignDate?: string
  }>,
  fallbackCompany = ""
): SaasCustomerLoginAccount[] {
  const active = (rows || []).filter((row) => {
    const resign = String(row.resignDate || "").trim()
    if (resign) return false
    const name = String(row.name || "").trim()
    const store = String(row.store || "").trim()
    if (!name || !store) return false
    return isCustomerErpAdminLoginRole(String(row.role || ""))
  })
  active.sort((a, b) => Number(b.id || 0) - Number(a.id || 0))
  return active.map((row) => ({
    id: Number(row.id) || 0,
    company: String(row.company || fallbackCompany).trim(),
    store: String(row.store || "").trim(),
    name: String(row.name || "").trim(),
    role: String(row.role || "").trim(),
  }))
}

export function buildCustomerAdminLoginHref(params: {
  company: string
  store?: string
  name?: string
}): string {
  const p = new URLSearchParams()
  p.set("redirect", "/admin")
  const company = String(params.company || "").trim()
  const store = String(params.store || "").trim()
  const name = String(params.name || "").trim()
  if (company) p.set("company", company)
  if (store) p.set("store", store)
  if (name) p.set("user", name)
  return `/admin/login?${p.toString()}`
}
