import { supabaseSelect, supabaseSelectFilter, supabaseUpsertMerge } from "@/lib/supabase-server"
import { isLegacyChoongmanErpSupabase } from "@/lib/erp-legacy-supabase"
import { resolveTenantIdForStoreCode } from "@/lib/tenant-integration-resolve"
import {
  normalizePosDeviceBillingBasis,
  sumLicensedPosFromStoreRows,
} from "@/lib/saas-tenant-pos-licensed"

type StoreRow = { tenant_id?: string | null; store_code?: string | null }
type PrinterRow = {
  store_code?: string | null
  main_device_max_count?: unknown
  order_device_max_count?: unknown
  main_device_role_locked?: unknown
}

export async function loadLicensedPosByTenant(tenantIds?: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>()
  if (isLegacyChoongmanErpSupabase()) return out
  const scopeIds = (tenantIds || []).map((id) => String(id || "").trim()).filter(Boolean)
  try {
    let stores: StoreRow[]
    if (scopeIds.length === 1) {
      stores = (await supabaseSelectFilter(
        "erp_stores",
        `tenant_id=eq.${encodeURIComponent(scopeIds[0]!)}`,
        { limit: 500, select: "tenant_id,store_code" }
      )) as StoreRow[]
    } else if (scopeIds.length > 1) {
      const filter = `tenant_id=in.(${scopeIds.map((id) => encodeURIComponent(id)).join(",")})`
      stores = (await supabaseSelectFilter("erp_stores", filter, {
        limit: Math.min(5000, scopeIds.length * 50),
        select: "tenant_id,store_code",
      })) as StoreRow[]
    } else {
      stores = (await supabaseSelect("erp_stores", {
        limit: 5000,
        select: "tenant_id,store_code",
      })) as StoreRow[]
    }
    if (!Array.isArray(stores) || stores.length === 0) return out

    const byTenant = new Map<string, string[]>()
    for (const row of stores) {
      const tenantId = String(row.tenant_id || "").trim()
      const storeCode = String(row.store_code || "").trim()
      if (!tenantId || !storeCode) continue
      if (scopeIds.length > 0 && !scopeIds.includes(tenantId)) continue
      const list = byTenant.get(tenantId) || []
      list.push(storeCode)
      byTenant.set(tenantId, list)
    }
    if (byTenant.size === 0) return out

    const allCodes = [...new Set([...byTenant.values()].flat())]
    let printerRows: PrinterRow[] = []
    if (allCodes.length === 1) {
      printerRows = (await supabaseSelectFilter(
        "pos_printer_settings",
        `store_code=eq.${encodeURIComponent(allCodes[0]!)}`,
        { limit: 20, select: "store_code,main_device_max_count,order_device_max_count,main_device_role_locked" }
      )) as PrinterRow[]
    } else if (allCodes.length > 0 && allCodes.length <= 80) {
      const filter = `store_code=in.(${allCodes.map((c) => `"${c.replace(/"/g, "")}"`).join(",")})`
      printerRows = (await supabaseSelectFilter("pos_printer_settings", filter, {
        limit: Math.min(10000, allCodes.length * 5),
        select: "store_code,main_device_max_count,order_device_max_count,main_device_role_locked",
      })) as PrinterRow[]
    } else {
      printerRows = (await supabaseSelect("pos_printer_settings", {
        limit: 10000,
        select: "store_code,main_device_max_count,order_device_max_count,main_device_role_locked",
      })) as PrinterRow[]
    }
    const settingsByStore = new Map<string, PrinterRow>()
    for (const row of printerRows || []) {
      const code = String(row.store_code || "").trim()
      if (code) settingsByStore.set(code, row)
    }

    for (const [tenantId, codes] of byTenant.entries()) {
      out.set(tenantId, sumLicensedPosFromStoreRows(codes, settingsByStore))
    }
  } catch (e) {
    console.warn("loadLicensedPosByTenant:", e)
  }
  return out
}

export async function resolveTenantIdForStore(storeCode: string): Promise<string | null> {
  const tenantId = await resolveTenantIdForStoreCode(storeCode)
  return tenantId || null
}

/** ERP 단말 설정 저장 후 SaaS 한도(max_pos_devices) 동기화 — erp_admin 기준 테넌트만 */
export async function syncTenantMaxPosFromErpAdmin(storeCode: string): Promise<void> {
  if (isLegacyChoongmanErpSupabase()) return
  const tenantId = await resolveTenantIdForStore(storeCode)
  if (!tenantId) return

  let basis = "erp_admin"
  try {
    const policyRows = (await supabaseSelectFilter("tenant_policy_settings", `tenant_id=eq.${encodeURIComponent(tenantId)}`, {
      limit: 1,
      select: "pricing_mode,pos_device_billing_basis",
    })) as Array<{ pricing_mode?: string | null; pos_device_billing_basis?: string | null }>
    const row = policyRows?.[0]
    const pricingMode = String(row?.pricing_mode || "module").trim() === "stage" ? "stage" : "module"
    basis = normalizePosDeviceBillingBasis(row?.pos_device_billing_basis, pricingMode)
  } catch {
    basis = "erp_admin"
  }
  if (basis !== "erp_admin") return

  const licensedMap = await loadLicensedPosByTenant()
  const licensed = licensedMap.get(tenantId)
  if (licensed == null || licensed <= 0) return

  const nowIso = new Date().toISOString()
  try {
    await supabaseUpsertMerge("tenant_limit_overrides", "tenant_id", {
      tenant_id: tenantId,
      max_pos_devices: licensed,
      updated_at: nowIso,
    })
  } catch (e) {
    console.warn("syncTenantMaxPosFromErpAdmin:", tenantId, e)
  }
}
