import { NextRequest, NextResponse } from "next/server"
import { canAccessSaasAdmin } from "@/lib/permissions"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseSelect, supabaseUpsert } from "@/lib/supabase-server"
import {
  defaultModuleCatalogRows,
  modulePricesFromCatalog,
  SAAS_MODULE_KEYS,
  type SaasModuleCatalogRow,
  type SaasModuleKey,
} from "@/lib/saas-module-pricing"

export const dynamic = "force-dynamic"

type CatalogDbRow = {
  module_key: string
  monthly_price?: number | null
  yearly_price?: number | null
  is_per_unit?: boolean | null
  is_custom_quote?: boolean | null
  sort_order?: number | null
}

function rowsFromDb(raw: CatalogDbRow[]): SaasModuleCatalogRow[] {
  const defaults = defaultModuleCatalogRows()
  const byKey = new Map(defaults.map((r) => [r.moduleKey, r]))
  for (const row of raw) {
    const key = String(row.module_key || "").trim() as SaasModuleKey
    if (!SAAS_MODULE_KEYS.includes(key)) continue
    const base = byKey.get(key)!
    byKey.set(key, {
      moduleKey: key,
      monthly: Math.max(0, Number(row.monthly_price ?? base.monthly)),
      yearly: Math.max(0, Number(row.yearly_price ?? base.yearly)),
      isPerUnit: row.is_per_unit === true || base.isPerUnit,
      isCustomQuote: row.is_custom_quote === true || base.isCustomQuote,
      sortOrder: Number(row.sort_order ?? base.sortOrder),
    })
  }
  return [...byKey.values()].sort((a, b) => a.sortOrder - b.sortOrder)
}

async function loadCatalogRows(): Promise<SaasModuleCatalogRow[]> {
  try {
    const raw = (await supabaseSelect("saas_module_price_catalog", {
      order: "sort_order.asc",
      limit: 100,
    })) as CatalogDbRow[]
    if (!Array.isArray(raw) || raw.length === 0) return defaultModuleCatalogRows()
    return rowsFromDb(raw)
  } catch {
    return defaultModuleCatalogRows()
  }
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  const rows = await loadCatalogRows()
  const modulePrices = modulePricesFromCatalog(rows)
  return NextResponse.json({ success: true, rows, modulePrices }, { headers })
}

type SaveBody = { rows?: SaasModuleCatalogRow[] }

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  try {
    const body = (await req.json()) as SaveBody
    const input = Array.isArray(body.rows) ? body.rows : []
    const nowIso = new Date().toISOString()
    const payload = SAAS_MODULE_KEYS.map((moduleKey, index) => {
      const hit = input.find((x) => x.moduleKey === moduleKey)
      const fallback = defaultModuleCatalogRows().find((x) => x.moduleKey === moduleKey)!
      const row = hit || fallback
      return {
        module_key: moduleKey,
        monthly_price: Math.max(0, Number(row.monthly ?? fallback.monthly)),
        yearly_price: Math.max(0, Number(row.yearly ?? fallback.yearly)),
        is_per_unit: row.isPerUnit === true,
        is_custom_quote: row.isCustomQuote === true,
        sort_order: Number(row.sortOrder ?? (index + 1) * 10),
        updated_at: nowIso,
      }
    })
    await supabaseUpsert("saas_module_price_catalog", payload, "module_key")
    const rows = rowsFromDb(payload)
    return NextResponse.json({ success: true, rows, modulePrices: modulePricesFromCatalog(rows) }, { headers })
  } catch (error) {
    console.error("saasAdminModulePricingCatalog POST:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}
