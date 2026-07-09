import { NextRequest, NextResponse } from "next/server"
import {
  assertTenantInScope,
  loadPartnerTenantIdSet,
  requireSaasControlPlane,
  type SaasScope,
} from "@/lib/saas-control-plane-scope"
import {
  supabaseSelect,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseSelectPageCap,
  supabaseUpdateByFilter,
} from "@/lib/supabase-server"
import { invalidateLoginDataCache } from "@/lib/login-data-cache-server"
import { invalidateErpStoresMasterCache } from "@/lib/erp-store-master"
import { loadErpStoreRowsForTenant, tenantHasErpStoreName } from "@/lib/saas-tenant-stores-server"
import { supabaseInsertWithPgrst204Fallback } from "@/lib/supabase-pgrst204-retry"

function bustStoreListCaches(): void {
  invalidateLoginDataCache()
  invalidateErpStoresMasterCache()
}

export const dynamic = "force-dynamic"

type TenantOpt = { id: string; companyName: string }
type UpdateBody = {
  id?: number
  tenantId?: string | null
  storeName?: string
  storeCode?: string
  isActive?: boolean
}
type CreateBody = {
  tenantId?: string
  storeName?: string
  storeCode?: string
}

function normalizeStoreCode(raw: string, tenantId: string, storeName: string): string {
  const code = String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  if (code) return code.slice(0, 64)
  const baseTenant = String(tenantId || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const baseStore = String(storeName || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "")
  const fallback = `${baseTenant || "tenant"}_${baseStore || "store"}`
  return fallback.slice(0, 64)
}

async function loadTenantOptions(scope: SaasScope): Promise<TenantOpt[]> {
  try {
    const rows = (await supabaseSelect("tenants", {
      order: "company_name.asc",
      limit: 500,
      select: "id,company_name",
    })) as { id?: string; company_name?: string }[]
    let opts = (rows || [])
      .map((r) => ({ id: String(r.id || "").trim(), companyName: String(r.company_name || "").trim() }))
      .filter((t) => t.id)
    if (scope.kind === "partner") {
      const allowed = await loadPartnerTenantIdSet(scope.partnerId)
      opts = opts.filter((t) => allowed.has(t.id))
    }
    return opts
  } catch {
    return []
  }
}

function normalizeStoreRow(
  r: Record<string, unknown>,
  companyByTenant: Map<string, string>
): {
  id: number
  tenantId: string | null
  companyName: string
  label: string
  storeName: string
  storeCode: string
  isActive: boolean
  createdAt: string
  kind: "saas" | "legacy"
} {
  const tid = r.tenant_id != null && String(r.tenant_id).trim() !== "" ? String(r.tenant_id).trim() : null
  const storeName = String(r.store_name ?? "").trim()
  const displayName = String(r.display_name ?? "").trim()
  const storeCode = String(r.store_code ?? "").trim()
  const label = storeName || displayName || storeCode || `#${r.id}`
  const companyName = tid ? companyByTenant.get(tid) ?? "" : ""
  const kind: "saas" | "legacy" = storeName || tid ? "saas" : "legacy"
  return {
    id: Number(r.id) || 0,
    tenantId: tid,
    companyName,
    label,
    storeName: storeName || displayName,
    storeCode,
    isActive: r.is_active !== false,
    createdAt: String(r.created_at ?? ""),
    kind,
  }
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Cache-Control", "no-store")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get("tenantId")?.trim().toLowerCase() || ""
    const q = searchParams.get("q")?.trim().toLowerCase() || ""
    const offset = Math.min(100_000, Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0))
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "200", 10) || 200))

    if (tenantId) {
      const inScope = await assertTenantInScope(cp.scope, tenantId)
      if (!inScope) {
        return NextResponse.json({ success: false, message: "해당 고객사에 접근할 수 없습니다." }, { status: 403, headers })
      }
    }

    const tenantOptions = await loadTenantOptions(cp.scope)
    const companyByTenant = new Map(tenantOptions.map((t) => [t.id, t.companyName]))

    const cap = Math.min(limit, supabaseSelectPageCap())
    let raw: Record<string, unknown>[] = []

    const tenantFilter = tenantId ? `tenant_id=eq.${encodeURIComponent(tenantId)}` : ""
    const allRowsFilter = "id=gte.0"

    if (q) {
      try {
        const f = tenantId ? tenantFilter : allRowsFilter
        raw = (await supabaseSelectFilterAllPages("erp_stores", f, {
          order: "id.desc",
          select: "*",
          maxRows: 5000,
          pageSize: 800,
        })) as Record<string, unknown>[]
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/column|42703|tenant_id/i.test(msg) && tenantId) {
          raw = []
        } else if (/column|42703|tenant_id/i.test(msg)) {
          raw = (await supabaseSelectFilterAllPages("erp_stores", allRowsFilter, {
            order: "id.desc",
            select: "*",
            maxRows: 5000,
            pageSize: 800,
          })) as Record<string, unknown>[]
        } else {
          throw e
        }
      }
    } else if (tenantId) {
      const companyName = tenantOptions.find((t) => t.id === tenantId)?.companyName ?? ""
      raw = await loadErpStoreRowsForTenant({
        tenantId,
        companyName,
        offset,
        limit: cap,
      })
    } else {
      raw = (await supabaseSelect("erp_stores", {
        order: "id.desc",
        offset,
        limit: cap,
        select: "*",
      })) as Record<string, unknown>[]
    }

    const mapped = (Array.isArray(raw) ? raw : []).map((r) => normalizeStoreRow(r, companyByTenant))
    const hasMore = q ? false : mapped.length >= cap
    let rows = mapped
    if (q) {
      rows = mapped.filter((row) => {
        const b = `${row.companyName} ${row.label} ${row.storeCode} ${row.tenantId || ""}`.toLowerCase()
        return b.includes(q)
      })
    }

    return NextResponse.json(
      {
        success: true,
        tenantOptions,
        rows,
        pagination: { offset, limit: cap, hasMore },
      },
      { headers }
    )
  } catch (error) {
    console.error("saasAdminStores:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}

export async function PATCH(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const body = (await req.json()) as UpdateBody
    const id = Number(body.id || 0)
    const tenantId = String(body.tenantId || "").trim().toLowerCase()
    const storeName = String(body.storeName || "").trim()
    const storeCode = String(body.storeCode || "").trim()
    if (typeof body.isActive !== "boolean") {
      return NextResponse.json({ success: false, message: "isActive(boolean)가 필요합니다." }, { status: 400, headers })
    }

    let filter = ""
    if (id > 0) {
      filter = `id=eq.${id}`
    } else if (tenantId && storeName) {
      filter = `tenant_id=eq.${encodeURIComponent(tenantId)}&store_name=eq.${encodeURIComponent(storeName)}`
    } else if (storeCode) {
      filter = `store_code=eq.${encodeURIComponent(storeCode)}`
    } else {
      return NextResponse.json(
        { success: false, message: "id 또는 (tenantId+storeName) 또는 storeCode가 필요합니다." },
        { status: 400, headers }
      )
    }

    if (tenantId) {
      const inScope = await assertTenantInScope(cp.scope, tenantId)
      if (!inScope) {
        return NextResponse.json({ success: false, message: "해당 고객사에 접근할 수 없습니다." }, { status: 403, headers })
      }
    }

    await supabaseUpdateByFilter("erp_stores", filter, { is_active: body.isActive })
    bustStoreListCaches()
    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    console.error("saasAdminStores PATCH:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const body = (await req.json()) as CreateBody
    const tenantId = String(body.tenantId || "").trim().toLowerCase()
    const storeName = String(body.storeName || "").trim()
    const storeCode = normalizeStoreCode(String(body.storeCode || ""), tenantId, storeName)
    if (!tenantId || !storeName) {
      return NextResponse.json({ success: false, message: "tenantId와 storeName은 필수입니다." }, { status: 400, headers })
    }

    const inScope = await assertTenantInScope(cp.scope, tenantId)
    if (!inScope) {
      return NextResponse.json({ success: false, message: "해당 고객사에 접근할 수 없습니다." }, { status: 403, headers })
    }

    const tenantRows = (await supabaseSelectFilter("tenants", `id=eq.${encodeURIComponent(tenantId)}`, {
      limit: 1,
      select: "id,company_name",
    })) as { id?: string; company_name?: string }[]
    const tenant = tenantRows?.[0]
    if (!tenant?.id) {
      return NextResponse.json({ success: false, message: "선택한 고객사를 찾지 못했습니다." }, { status: 404, headers })
    }

    const companyName = String(tenant.company_name || tenantId)

    if (await tenantHasErpStoreName(tenantId, storeName, companyName)) {
      return NextResponse.json(
        {
          success: true,
          tenantId,
          companyName,
          storeName,
          storeCode,
          alreadyExists: true,
        },
        { headers }
      )
    }

    try {
      await supabaseInsertWithPgrst204Fallback(
        "erp_stores",
        {
          tenant_id: tenantId,
          store_name: storeName,
          store_code: storeCode,
          display_name: storeName,
          aliases: [storeName],
          is_active: true,
          sort_order: 999,
        },
        "saasAdminStores create"
      )
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/(duplicate key|23505)/i.test(msg)) {
        if (await tenantHasErpStoreName(tenantId, storeName, companyName)) {
          return NextResponse.json(
            {
              success: true,
              tenantId,
              companyName,
              storeName,
              storeCode,
              alreadyExists: true,
            },
            { headers }
          )
        }
        return NextResponse.json({ success: false, message: "이미 사용 중인 매장 코드/매장명입니다." }, { status: 409, headers })
      }
      throw e
    }

    bustStoreListCaches()

    return NextResponse.json(
      {
        success: true,
        tenantId,
        companyName,
        storeName,
        storeCode,
      },
      { headers }
    )
  } catch (error) {
    console.error("saasAdminStores POST:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}
