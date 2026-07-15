import { NextRequest, NextResponse } from "next/server"
import type { JwtPayload } from "./jwt-auth"
import { canAccessSaasAdmin } from "./permissions"
import { isSaasPartnerLoginStore } from "./saas-partner-login-defaults"
import { supabaseSelectFilter } from "./supabase-server"
import { requireAuth } from "./verify-auth"
import type { SaasScopeClientMeta } from "./saas-control-plane-scope-client"

export type { SaasScopeClientMeta, SaasScopeKind } from "./saas-control-plane-scope-client"
export { PLATFORM_SCOPE_CLIENT_META } from "./saas-control-plane-scope-client"

export type SaasScope =
  | { kind: "platform"; employeeId: number; employeeName: string }
  | {
      kind: "partner"
      partnerId: string
      partnerName: string
      defaultMarginPct: number
      employeeId: number
      employeeName: string
    }

type PartnerRow = { id?: string; name?: string; default_margin_pct?: number | null }

function isPartnerStoreKey(store: string): boolean {
  return isSaasPartnerLoginStore(store)
}

/** JWT에 employeeId가 없을 때(구 토큰·세션) company/store/name으로 employees.id 복구 */
export async function resolveEmployeeIdForSaasAuth(auth: JwtPayload): Promise<number> {
  const fromJwt = auth.employeeId != null ? Math.floor(Number(auth.employeeId)) : 0
  if (fromJwt > 0) return fromJwt

  const name = String(auth.name || "").trim()
  const store = String(auth.store || "").trim()
  const company = String(auth.company || "").trim()
  if (!name || !store) return 0

  try {
    const parts = [`name=eq.${encodeURIComponent(name)}`, `store=eq.${encodeURIComponent(store)}`]
    if (company) parts.push(`company=eq.${encodeURIComponent(company)}`)
    const rows = (await supabaseSelectFilter("employees", parts.join("&"), {
      limit: 5,
      select: "id,company,resign_date",
    })) as Array<{ id?: number; company?: string | null; resign_date?: string | null }>
    const active = (rows || []).filter((r) => !String(r.resign_date || "").trim())
    const pool = active.length > 0 ? active : rows || []
    if (company && pool.length > 1) {
      const exact = pool.find((r) => String(r.company || "").trim() === company)
      if (exact?.id) return Math.floor(Number(exact.id))
    }
    const id = Math.floor(Number(pool[0]?.id || 0))
    return id > 0 ? id : 0
  } catch {
    return 0
  }
}

async function loadPartnerScopeByEmployeeId(
  employeeId: number,
  employeeName: string
): Promise<SaasScope | null> {
  try {
    const userRows = (await supabaseSelectFilter(
      "saas_partner_users",
      `employee_id=eq.${employeeId}&is_active=eq.true`,
      { limit: 1, select: "partner_id,role,is_active" }
    )) as Array<{ partner_id?: string | null }>
    const partnerId = String(userRows?.[0]?.partner_id || "").trim()
    if (!partnerId) return null

    const partnerRows = (await supabaseSelectFilter(
      "saas_partners",
      `id=eq.${encodeURIComponent(partnerId)}&is_active=eq.true`,
      { limit: 1, select: "id,name,default_margin_pct,is_active" }
    )) as PartnerRow[]
    const partner = partnerRows?.[0]
    if (!partner?.id) return null

    return {
      kind: "partner",
      partnerId: String(partner.id),
      partnerName: String(partner.name || partner.id),
      defaultMarginPct: Math.max(0, Number(partner.default_margin_pct ?? 0)),
      employeeId,
      employeeName,
    }
  } catch {
    return null
  }
}

/** saas_partner_users 행이 없어도 employees.company = 대리점명이면 복구(수동 연결 누락·마이그레이션) */
async function loadPartnerScopeByCompanyMatch(params: {
  company: string
  store: string
  name: string
  employeeId: number
}): Promise<SaasScope | null> {
  const company = String(params.company || "").trim()
  const store = String(params.store || "").trim()
  const name = String(params.name || "").trim()
  if (!company || !store || !name || !isPartnerStoreKey(store)) return null

  try {
    const partnerRows = (await supabaseSelectFilter(
      "saas_partners",
      `name=eq.${encodeURIComponent(company)}&is_active=eq.true`,
      { limit: 1, select: "id,name,default_margin_pct,is_active" }
    )) as PartnerRow[]
    const partner = partnerRows?.[0]
    if (!partner?.id) return null

    let employeeId = params.employeeId
    if (employeeId <= 0) {
      employeeId = await resolveEmployeeIdForSaasAuth({
        store,
        name,
        role: "",
        company,
      })
    }
    if (employeeId <= 0) return null

    return {
      kind: "partner",
      partnerId: String(partner.id),
      partnerName: String(partner.name || partner.id),
      defaultMarginPct: Math.max(0, Number(partner.default_margin_pct ?? 0)),
      employeeId,
      employeeName: name,
    }
  } catch {
    return null
  }
}

export function saasScopeToClientMeta(scope: SaasScope): SaasScopeClientMeta {
  if (scope.kind === "partner") {
    return {
      kind: "partner",
      isPlatform: false,
      isPartner: true,
      partnerId: scope.partnerId,
      partnerName: scope.partnerName,
      defaultMarginPct: scope.defaultMarginPct,
    }
  }
  return {
    kind: "platform",
    isPlatform: true,
    isPartner: false,
    partnerId: null,
    partnerName: null,
    defaultMarginPct: 0,
  }
}

export async function resolveSaasScope(auth: JwtPayload): Promise<SaasScope> {
  const employeeId = await resolveEmployeeIdForSaasAuth(auth)
  const employeeName = String(auth.name || "")

  if (employeeId > 0) {
    const byLink = await loadPartnerScopeByEmployeeId(employeeId, employeeName)
    if (byLink) return byLink
  }

  const company = String(auth.company || "").trim()
  const store = String(auth.store || "").trim()
  if (company && store && employeeName) {
    const byCompany = await loadPartnerScopeByCompanyMatch({
      company,
      store,
      name: employeeName,
      employeeId,
    })
    if (byCompany) return byCompany
  }

  return {
    kind: "platform",
    employeeId,
    employeeName,
  }
}

export async function isSaasPartnerAuth(auth: JwtPayload): Promise<boolean> {
  const scope = await resolveSaasScope(auth)
  return scope.kind === "partner"
}

export async function canAccessSaasControlPlane(auth: JwtPayload): Promise<boolean> {
  if (canAccessSaasAdmin(auth.role || "")) return true
  const scope = await resolveSaasScope(auth)
  return scope.kind === "partner"
}

export async function requireSaasControlPlane(req: NextRequest): Promise<
  | { scope: SaasScope; auth: JwtPayload; errorResponse: null }
  | { scope: null; auth: null; errorResponse: NextResponse }
> {
  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) {
    return { scope: null, auth: null, errorResponse: authResult.errorResponse }
  }
  /** resolveSaasScope 1회만 — canAccess + scope 재조회 이중 왕복 제거 */
  const scope = await resolveSaasScope(authResult.auth)
  if (!(canAccessSaasAdmin(authResult.auth.role || "") || scope.kind === "partner")) {
    return {
      scope: null,
      auth: null,
      errorResponse: NextResponse.json(
        { success: false, message: "SaaS 관리자 권한이 필요합니다." },
        { status: 403 }
      ),
    }
  }
  return { scope, auth: authResult.auth, errorResponse: null }
}

export async function loadPartnerTenantIdSet(partnerId: string): Promise<Set<string>> {
  try {
    const rows = (await supabaseSelectFilter(
      "tenant_partner_assignments",
      `partner_id=eq.${encodeURIComponent(partnerId)}`,
      { limit: 5000, select: "tenant_id" }
    )) as Array<{ tenant_id?: string | null }>
    return new Set(
      (rows || [])
        .map((r) => String(r.tenant_id || "").trim())
        .filter(Boolean)
    )
  } catch {
    return new Set()
  }
}

export async function loadAllPartnerAssignments(): Promise<Map<string, { partnerId: string; partnerName: string }>> {
  const map = new Map<string, { partnerId: string; partnerName: string }>()
  try {
    const rows = (await supabaseSelectFilter("tenant_partner_assignments", "", {
      limit: 5000,
      select: "tenant_id,partner_id",
    })) as Array<{ tenant_id?: string; partner_id?: string }>
    const partnerIds = [...new Set((rows || []).map((r) => String(r.partner_id || "").trim()).filter(Boolean))]
    const partnerNameMap = new Map<string, string>()
    if (partnerIds.length > 0) {
      const partners = (await supabaseSelectFilter("saas_partners", "", {
        limit: 500,
        select: "id,name",
      })) as Array<{ id?: string; name?: string }>
      for (const p of partners || []) {
        const id = String(p.id || "").trim()
        if (id) partnerNameMap.set(id, String(p.name || id))
      }
    }
    for (const row of rows || []) {
      const tenantId = String(row.tenant_id || "").trim()
      const partnerId = String(row.partner_id || "").trim()
      if (!tenantId || !partnerId) continue
      map.set(tenantId, { partnerId, partnerName: partnerNameMap.get(partnerId) || partnerId })
    }
  } catch {
    // tables missing
  }
  return map
}

export async function assertTenantInScope(scope: SaasScope, tenantId: string): Promise<boolean> {
  const id = String(tenantId || "").trim()
  if (!id) return false
  if (scope.kind === "platform") return true
  const allowed = await loadPartnerTenantIdSet(scope.partnerId)
  return allowed.has(id)
}

export async function assignTenantToPartner(params: {
  tenantId: string
  partnerId: string
  assignedByEmployeeId?: number | null
}): Promise<void> {
  const { supabaseUpsert } = await import("./supabase-server")
  await supabaseUpsert(
    "tenant_partner_assignments",
    [
      {
        tenant_id: params.tenantId,
        partner_id: params.partnerId,
        assigned_at: new Date().toISOString(),
        assigned_by_employee_id: params.assignedByEmployeeId ?? null,
      },
    ],
    "tenant_id"
  )
}

export function filterTenantIdsForScope(scope: SaasScope, tenantIds: string[], allowed?: Set<string>): string[] {
  if (scope.kind === "platform") return tenantIds
  const set = allowed ?? new Set<string>()
  return tenantIds.filter((id) => set.has(id))
}
