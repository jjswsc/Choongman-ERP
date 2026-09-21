import { supabaseSelectFilter } from "@/lib/supabase-server"
import {
  appendInventoryTenantFilter,
  isInventoryTenantQueryBlocked,
  isMissingInventoryTenantIdColumnError,
  markInventoryTenantIdColumnMissing,
  type InventoryTenantScope,
} from "@/lib/inventory-tenant-scope"
import { fetchHeadOfficeVendorRow, toInvoiceHeadOfficeCompany } from "@/lib/head-office-vendor"

/** getInvoiceData·e-Tax: 인보이스 BILL TO 매칭에 쓰는 vendor 행 (중복 type 병합) */
export type InvoiceVendorForClient = {
  id?: number
  name?: string
  addr?: string
  tax_id?: string
  phone?: string
  gps_name?: string
  sales_outlet?: string
}

export type InvoiceSellerCompany = {
  companyName: string
  address: string
  taxId: string
  phone: string
}

export type InvoiceBillToClient = {
  companyName: string
  address: string
  taxId: string
  phone: string
}

const SALES_VENDOR_TYPE_FILTERS = [
  "type=eq.매출처",
  "type=eq.sales",
  "type=eq.both",
  "type=eq.둘 다",
  "type=eq.매출",
] as const

const OFFICE_CLIENT_KEYS = ["Office", "본사", "오피스", "본점", "Head Office"] as const

/**
 * DB에 매출처+매입처·둘다가 섞여 있어도 인보이스 clients 맵에 모두 올릴 수 있게
 * 예전 로직(매출처 → 없을 때만 sales → 없을 때만 both)이면, sales가 한 건이라도 있을 때
 * type=both 전부가 BILL TO에서 누락됨.
 */
export async function fetchSalesTypesVendorsForInvoice(
  scope: InventoryTenantScope
): Promise<InvoiceVendorForClient[]> {
  if (isInventoryTenantQueryBlocked(scope)) return []
  let batches: InvoiceVendorForClient[][]
  try {
    batches = (await Promise.all(
      SALES_VENDOR_TYPE_FILTERS.map((f) =>
        supabaseSelectFilter("vendors", appendInventoryTenantFilter(f, scope), { limit: 500 })
      )
    )) as InvoiceVendorForClient[][]
  } catch (err) {
    if (isMissingInventoryTenantIdColumnError(err)) {
      markInventoryTenantIdColumnMissing()
      if (scope.enforce) return []
    }
    throw err
  }
  const byId = new Map<number, InvoiceVendorForClient>()
  for (const batch of batches) {
    for (const r of batch || []) {
      const id = Number((r as { id?: number }).id)
      if (Number.isFinite(id) && id > 0) {
        if (!byId.has(id)) byId.set(id, r)
      }
    }
  }
  return [...byId.values()]
}

function addClientKeys(
  clients: Record<string, InvoiceBillToClient>,
  keys: string[],
  entry: InvoiceBillToClient
) {
  const seen = new Set<string>()
  for (const k of keys) {
    const key = String(k || "").trim()
    if (!key || seen.has(key)) continue
    seen.add(key)
    clients[key] = entry
    const normalized = key.toLowerCase()
    if (normalized && normalized !== key) clients[normalized] = entry
  }
}

export async function loadInvoiceSellerAndBillTo(scope: InventoryTenantScope): Promise<{
  company: InvoiceSellerCompany
  clients: Record<string, InvoiceBillToClient>
}> {
  const hqRow = await fetchHeadOfficeVendorRow(scope)
  const company = toInvoiceHeadOfficeCompany(hqRow, scope)

  const clients: Record<string, InvoiceBillToClient> = {}
  if (company.companyName || company.taxId || company.address) {
    const officeEntry: InvoiceBillToClient = {
      companyName: company.companyName,
      address: company.address || "-",
      taxId: company.taxId || "-",
      phone: company.phone || "-",
    }
    addClientKeys(clients, [...OFFICE_CLIENT_KEYS], officeEntry)
  }

  const clientRows = await fetchSalesTypesVendorsForInvoice(scope)
  for (const r of clientRows) {
    const companyName = String(r.name || "").trim()
    const gpsName = String(r.gps_name || "").trim()
    const salesOutlet = String(r.sales_outlet || "").trim()
    const displayName = salesOutlet || gpsName || companyName
    if (!companyName && !gpsName && !salesOutlet) continue
    const entry: InvoiceBillToClient = {
      companyName: companyName || displayName,
      address: String(r.addr || "").trim() || "-",
      taxId: String(r.tax_id || "").trim() || "-",
      phone: String(r.phone || "").trim() || "-",
    }
    const keysToAdd = [companyName, gpsName, salesOutlet].filter(Boolean)
    if (gpsName && gpsName.match(/^CM\s+/i)) keysToAdd.push(gpsName.replace(/^CM\s+/i, ""))
    addClientKeys(clients, keysToAdd, entry)
  }

  return { company, clients }
}
