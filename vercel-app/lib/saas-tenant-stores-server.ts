import {
  supabaseCountFilter,
  supabaseSelect,
  supabaseSelectFilterAllPages,
  supabaseSelectFilterRange,
} from "./supabase-server"

function isTenantColumnError(msg: string): boolean {
  return /column|42703|tenant_id|PGRST204/i.test(msg)
}

function storeRowLabel(r: Record<string, unknown>): string {
  return String(r.store_name ?? r.display_name ?? "").trim()
}

async function employeeStoreNamesForTenant(tenantId: string, companyName: string): Promise<Set<string>> {
  const names = new Set<string>()
  const tid = tenantId.trim().toLowerCase()
  const company = companyName.trim()

  async function addFromFilter(filter: string, select: string) {
    try {
      const rows = (await supabaseSelectFilterAllPages("employees", filter, {
        select,
        order: "id.desc",
        maxRows: 2000,
        pageSize: 500,
      })) as { store?: string }[]
      for (const r of rows || []) {
        const s = String(r.store ?? "").trim()
        if (s) names.add(s)
      }
    } catch {
      /* ignore */
    }
  }

  await addFromFilter(`tenant_id=eq.${encodeURIComponent(tid)}`, "store,tenant_id,company")
  if (names.size === 0 && company) {
    await addFromFilter(`company=eq.${encodeURIComponent(company)}`, "store,company")
  }
  return names
}

function rowBelongsToTenant(
  r: Record<string, unknown>,
  tenantId: string,
  employeeStores: Set<string>
): boolean {
  const tid = tenantId.trim().toLowerCase()
  const rowTid = r.tenant_id != null ? String(r.tenant_id).trim().toLowerCase() : ""
  if (rowTid && rowTid === tid) return true

  const label = storeRowLabel(r)
  if (label && employeeStores.has(label)) return true

  const code = String(r.store_code ?? "").trim().toLowerCase()
  if (code && (code.startsWith(`${tid}_`) || code === tid)) return true

  const aliases = r.aliases
  if (Array.isArray(aliases)) {
    for (const a of aliases) {
      const alias = String(a ?? "").trim()
      if (alias && employeeStores.has(alias)) return true
    }
  }

  return false
}

async function loadAllErpStoreRows(): Promise<Record<string, unknown>[]> {
  try {
    return (await supabaseSelectFilterAllPages("erp_stores", "id=gte.0", {
      order: "id.desc",
      select: "*",
      maxRows: 5000,
      pageSize: 800,
    })) as Record<string, unknown>[]
  } catch {
    try {
      return (await supabaseSelect("erp_stores", {
        order: "id.desc",
        limit: 5000,
        select: "*",
      })) as Record<string, unknown>[]
    } catch {
      return []
    }
  }
}

/** tenant_id 컬럼·값이 없어도 employees/store_code로 테넌트 매장을 찾는다. */
export async function loadErpStoreRowsForTenant(params: {
  tenantId: string
  companyName?: string
  offset?: number
  limit?: number
}): Promise<Record<string, unknown>[]> {
  const tenantId = params.tenantId.trim().toLowerCase()
  if (!tenantId) return []

  const companyName = String(params.companyName || "").trim()
  const offset = Math.max(0, params.offset ?? 0)
  const limit = Math.min(500, Math.max(1, params.limit ?? 200))

  try {
    const direct = (await supabaseSelectFilterRange("erp_stores", `tenant_id=eq.${encodeURIComponent(tenantId)}`, {
      order: "id.desc",
      select: "*",
      rangeStart: offset,
      rangeEnd: offset + limit - 1,
    })) as Record<string, unknown>[]
    if (direct.length > 0) return direct
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!isTenantColumnError(msg)) throw e
  }

  const employeeStores = await employeeStoreNamesForTenant(tenantId, companyName)
  const all = await loadAllErpStoreRows()
  const matched = all.filter((r) => rowBelongsToTenant(r, tenantId, employeeStores))
  return matched.slice(offset, offset + limit)
}

export async function countErpStoresForTenant(tenantId: string, companyName = ""): Promise<number> {
  const tid = tenantId.trim().toLowerCase()
  if (!tid) return 0

  try {
    const n = await supabaseCountFilter("erp_stores", `tenant_id=eq.${encodeURIComponent(tid)}`)
    if (n > 0) return n
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!isTenantColumnError(msg)) throw e
  }

  const rows = await loadErpStoreRowsForTenant({ tenantId: tid, companyName, offset: 0, limit: 5000 })
  return rows.length
}

export type SaasLoginStoreEntry = {
  companyName: string
  storeName: string
  storeCode: string
}

/** ERP 로그인 매장 셀렉트 — erp_stores(SaaS) + tenants.company_name */
export async function loadSaasLoginStoreEntries(): Promise<SaasLoginStoreEntry[]> {
  const companyByTenant = new Map<string, string>()
  try {
    const tenantRows = (await supabaseSelect("tenants", {
      select: "id,company_name",
      limit: 500,
      order: "company_name.asc",
    })) as { id?: string; company_name?: string }[]
    for (const row of tenantRows || []) {
      const id = String(row.id || "").trim().toLowerCase()
      const name = String(row.company_name || "").trim()
      if (id) companyByTenant.set(id, name || id)
    }
  } catch {
    return []
  }

  let storeRows: Record<string, unknown>[] = []
  try {
    storeRows = (await supabaseSelect("erp_stores", {
      select: "tenant_id,store_name,store_code,is_active",
      limit: 5000,
      order: "store_name.asc",
    })) as Record<string, unknown>[]
  } catch {
    try {
      storeRows = await loadAllErpStoreRows()
    } catch {
      return []
    }
  }

  const out: SaasLoginStoreEntry[] = []
  for (const row of storeRows) {
    if (row.is_active === false) continue
    const tenantId = String(row.tenant_id ?? "").trim().toLowerCase()
    const storeName = String(row.store_name ?? row.display_name ?? "").trim()
    if (!tenantId || !storeName) continue
    out.push({
      companyName: companyByTenant.get(tenantId) || tenantId,
      storeName,
      storeCode: String(row.store_code ?? "").trim(),
    })
  }
  return out
}
