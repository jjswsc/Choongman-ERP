import { NextRequest, NextResponse } from "next/server"
import type { JwtPayload } from "./jwt-auth"
import { canAccessSaasAdmin } from "./permissions"
import { supabaseSelectFilter } from "./supabase-server"
import { requireAuth } from "./verify-auth"

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

export type SaasScopeClientMeta = {
  kind: SaasScope["kind"]
  isPlatform: boolean
  isPartner: boolean
  partnerId: string | null
  partnerName: string | null
  defaultMarginPct: number
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
  const rawId = auth.employeeId
  const employeeId = rawId != null && Number.isFinite(Number(rawId)) ? Math.floor(Number(rawId)) : 0

  if (employeeId > 0) {
    try {
      const userRows = (await supabaseSelectFilter(
        "saas_partner_users",
        `employee_id=eq.${employeeId}&is_active=eq.true`,
        { limit: 1, select: "partner_id,role,is_active" }
      )) as Array<{ partner_id?: string | null }>
      const partnerId = String(userRows?.[0]?.partner_id || "").trim()
      if (partnerId) {
        const partnerRows = (await supabaseSelectFilter(
          "saas_partners",
          `id=eq.${encodeURIComponent(partnerId)}&is_active=eq.true`,
          { limit: 1, select: "id,name,default_margin_pct,is_active" }
        )) as Array<{ id?: string; name?: string; default_margin_pct?: number | null }>
        const partner = partnerRows?.[0]
        if (partner?.id) {
          return {
            kind: "partner",
            partnerId: String(partner.id),
            partnerName: String(partner.name || partner.id),
            defaultMarginPct: Math.max(0, Number(partner.default_margin_pct ?? 0)),
            employeeId,
            employeeName: String(auth.name || ""),
          }
        }
      }
    } catch {
      // partner tables not deployed — fall through to platform
    }
  }

  return {
    kind: "platform",
    employeeId,
    employeeName: String(auth.name || ""),
  }
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
  if (!(await canAccessSaasControlPlane(authResult.auth))) {
    return {
      scope: null,
      auth: null,
      errorResponse: NextResponse.json(
        { success: false, message: "SaaS 관리자 권한이 필요합니다." },
        { status: 403 }
      ),
    }
  }
  const scope = await resolveSaasScope(authResult.auth)
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
