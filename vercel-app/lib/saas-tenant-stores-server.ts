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

function scoreErpStoreRow(r: Record<string, unknown>): number {
  let s = 0
  if (String(r.tenant_id ?? "").trim()) s += 4
  if (String(r.store_name ?? "").trim()) s += 2
  if (String(r.store_code ?? "").trim()) s += 1
  if (String(r.display_name ?? "").trim()) s += 1
  return s
}

/** 동일 테넌트·표시명 중복 행(store_name vs display_name legacy) 제거 */
export function dedupeErpStoreRowsForTenant(
  rows: Record<string, unknown>[],
  tenantId: string
): Record<string, unknown>[] {
  const tid = tenantId.trim().toLowerCase()
  const byLabel = new Map<string, Record<string, unknown>>()
  for (const r of rows) {
    const label = storeRowLabel(r).toLowerCase()
    if (!label) continue
    const rowTid = String(r.tenant_id ?? "").trim().toLowerCase()
    if (rowTid && rowTid !== tid) continue
    const prev = byLabel.get(label)
    if (!prev || scoreErpStoreRow(r) > scoreErpStoreRow(prev)) {
      byLabel.set(label, r)
    }
  }
  return Array.from(byLabel.values())
}

export async function tenantHasErpStoreName(
  tenantId: string,
  storeName: string,
  companyName = ""
): Promise<boolean> {
  const norm = storeName.trim().toLowerCase()
  if (!norm) return false
  const rows = await loadErpStoreRowsForTenant({
    tenantId,
    companyName,
    offset: 0,
    limit: 500,
  })
  return rows.some((r) => storeRowLabel(r).toLowerCase() === norm)
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
    if (direct.length > 0) return dedupeErpStoreRowsForTenant(direct, tenantId)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!isTenantColumnError(msg)) throw e
  }

  const employeeStores = await employeeStoreNamesForTenant(tenantId, companyName)
  const all = await loadAllErpStoreRows()
  const matched = dedupeErpStoreRowsForTenant(
    all.filter((r) => rowBelongsToTenant(r, tenantId, employeeStores)),
    tenantId
  )
  return matched.slice(offset, offset + limit)
}

export async function countErpStoresForTenant(tenantId: string, companyName = ""): Promise<number> {
  const tid = tenantId.trim().toLowerCase()
  if (!tid) return 0

  try {
    /** count=0도 신뢰 — 예전엔 0일 때 loadAllErpStoreRows(최대 5000)로 떨어져 고객사 1건에도 수 초~수십 초 지연됨 */
    const n = await supabaseCountFilter("erp_stores", `tenant_id=eq.${encodeURIComponent(tid)}`)
    return Math.max(0, n)
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (!isTenantColumnError(msg)) throw e
  }

  /** tenant_id 컬럼이 없는 레거시 DB에서만 풀스캔 fallback */
  const rows = await loadErpStoreRowsForTenant({ tenantId: tid, companyName, offset: 0, limit: 500 })
  return rows.length
}

export type SaasLoginStoreEntry = {
  companyName: string
  storeName: string
  storeCode: string
}

/** legacy insert(store_code={tenant}_{store}) 후 tenant_id 누락 시 로그인 목록 보강 */
function inferTenantIdForLoginRow(
  row: Record<string, unknown>,
  companyByTenant: Map<string, string>
): string {
  const direct = String(row.tenant_id ?? "")
    .trim()
    .toLowerCase()
  if (direct) return direct

  const code = String(row.store_code ?? "")
    .trim()
    .toLowerCase()
  if (!code.includes("_")) return ""
  const prefix = code.split("_")[0]
  if (prefix && companyByTenant.has(prefix)) return prefix
  return ""
}

/** ERP 로그인 매장 셀렉트 — erp_stores(SaaS) + tenants.company_name */
export async function loadSaasLoginStoreEntries(opts?: {
  tenantId?: string
  companyName?: string
}): Promise<SaasLoginStoreEntry[]> {
  const scopeTenantId = String(opts?.tenantId || "")
    .trim()
    .toLowerCase()
  const scopeCompany = String(opts?.companyName || "").trim()

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
  if (scopeTenantId) {
    try {
      storeRows = await loadErpStoreRowsForTenant({
        tenantId: scopeTenantId,
        companyName: scopeCompany,
        offset: 0,
        limit: 500,
      })
    } catch {
      storeRows = []
    }
  }

  if (storeRows.length === 0 && !scopeTenantId) {
    try {
      storeRows = (await supabaseSelect("erp_stores", {
        select: "tenant_id,store_name,store_code,is_active,display_name",
        limit: 5000,
        order: "store_name.asc",
      })) as Record<string, unknown>[]
    } catch {
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
    }
  }

  const seen = new Set<string>()
  const out: SaasLoginStoreEntry[] = []
  const scopeCompanyLower = scopeCompany.toLowerCase()
  for (const row of storeRows) {
    if (row.is_active === false) continue
    const tenantId = inferTenantIdForLoginRow(row, companyByTenant)
    const storeName = String(row.store_name ?? row.display_name ?? "").trim()
    if (!tenantId || !storeName) continue
    if (scopeTenantId && tenantId !== scopeTenantId) continue
    const companyName = companyByTenant.get(tenantId) || tenantId
    if (scopeCompanyLower && companyName.toLowerCase() !== scopeCompanyLower && tenantId !== scopeTenantId) {
      continue
    }
    const dedupeKey = `${tenantId}\0${storeName}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)
    out.push({
      companyName,
      storeName,
      storeCode: String(row.store_code ?? "").trim(),
    })
  }
  return out
}
