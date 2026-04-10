export interface TenantContext {
  tenantId?: string
  company?: string
}

export function normalizeTenantId(raw: unknown): string {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function deriveTenantIdFromCompany(company?: string): string | undefined {
  const t = normalizeTenantId(company)
  return t || undefined
}

export function normalizeCompanyName(raw: unknown): string {
  return String(raw || "").trim()
}
