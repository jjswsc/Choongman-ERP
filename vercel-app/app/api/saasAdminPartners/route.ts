import { NextRequest, NextResponse } from "next/server"
import { requireSaasControlPlane } from "@/lib/saas-control-plane-scope"
import type { CatalogRepricePolicy } from "@/lib/saas-partner-pricing-policy"
import {
  mapPartnerBillingCompanyFromRow,
  partnerBillingDbPatch,
  type SaasBillingCompanyInfo,
} from "@/lib/saas-billing-company-profile"
import { SAAS_MODULE_KEYS, type SaasModuleKey } from "@/lib/saas-module-pricing"
import {
  supabaseSelectFilterStrippingUnknownColumns,
  supabaseUpsertMergeWithPgrst204Fallback,
} from "@/lib/supabase-pgrst204-retry"
import { createSaasPartnerAdminEmployee } from "@/lib/saas-partner-admin-account-server"
import {
  supabaseSelectFilter,
  supabaseSelectFilterRange,
  supabaseUpsert,
} from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

type PartnerRow = {
  id: string
  name: string
  default_margin_pct: number
  catalog_reprice_policy?: string | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  legal_name?: string | null
  tax_id?: string | null
  billing_address?: string | null
  is_active: boolean
}

type PartnerUserRow = {
  id: number
  partner_id: string
  employee_id: number
  role: string
  is_active: boolean
}

type MarginRuleRow = {
  module_key: string
  margin_pct: number
}

const PARTNER_SELECT =
  "id,name,default_margin_pct,catalog_reprice_policy,contact_name,contact_phone,contact_email,legal_name,tax_id,billing_address,is_active"

async function loadPartners(
  filter: string,
  opts: { limit?: number; order?: string }
): Promise<PartnerRow[]> {
  return (await supabaseSelectFilterStrippingUnknownColumns(
    "saas_partners",
    filter,
    { ...opts, select: PARTNER_SELECT },
    "saasAdminPartners"
  )) as PartnerRow[]
}

function mapPartner(p: PartnerRow, tenantCount = 0, userCount = 0) {
  return {
    id: p.id,
    name: p.name,
    defaultMarginPct: Number(p.default_margin_pct ?? 0),
    catalogRepricePolicy: (p.catalog_reprice_policy || "retain_margin_pct") as CatalogRepricePolicy,
    contactName: p.contact_name || "",
    contactPhone: p.contact_phone || "",
    contactEmail: p.contact_email || "",
    billingCompany: mapPartnerBillingCompanyFromRow(p),
    isActive: p.is_active !== false,
    tenantCount,
    userCount,
  }
}

async function searchEmployees(q: string) {
  const keyword = q.trim().toLowerCase()
  if (!keyword) return []
  const idNum = Math.floor(Number(keyword))
  try {
    const rows = (await supabaseSelectFilterRange("employees", "id=gte.0", {
      order: "id.desc",
      select: "id,company,store,name,role",
      rangeStart: 0,
      rangeEnd: 799,
    })) as Array<{ id?: number; company?: string; store?: string; name?: string; role?: string }>
    return (rows || [])
      .filter((row) => {
        const id = Number(row.id || 0)
        const bundle = `${id} ${row.company || ""} ${row.store || ""} ${row.name || ""}`.toLowerCase()
        if (Number.isFinite(idNum) && idNum > 0 && id === idNum) return true
        return bundle.includes(keyword)
      })
      .slice(0, 20)
      .map((row) => ({
        id: Number(row.id || 0),
        company: String(row.company || "").trim(),
        store: String(row.store || "").trim(),
        name: String(row.name || "").trim(),
        role: String(row.role || "").trim(),
      }))
  } catch {
    return []
  }
}

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  const { searchParams } = new URL(req.url)
  const employeeSearch = searchParams.get("employeeSearch")?.trim() || ""
  if (employeeSearch && cp.scope.kind === "platform") {
    const employees = await searchEmployees(employeeSearch)
    return NextResponse.json({ success: true, employees }, { headers })
  }

  const partnerIdParam = searchParams.get("partnerId")?.trim() || ""
  const detailPartnerId = cp.scope.kind === "partner" ? cp.scope.partnerId : partnerIdParam

  if (detailPartnerId) {
    try {
      const rows = await loadPartners(`id=eq.${encodeURIComponent(detailPartnerId)}`, { limit: 1 })
      const partner = rows?.[0]
      if (!partner) {
        return NextResponse.json({ success: false, message: "대리점을 찾을 수 없습니다." }, { status: 404, headers })
      }

      let users: PartnerUserRow[] = []
      try {
        users = (await supabaseSelectFilter(
          "saas_partner_users",
          `partner_id=eq.${encodeURIComponent(detailPartnerId)}`,
          { limit: 200, select: "id,partner_id,employee_id,role,is_active" }
        )) as PartnerUserRow[]
      } catch {
        users = []
      }

      let assignments: Array<{ tenant_id: string; partner_id: string }> = []
      try {
        assignments = (await supabaseSelectFilter(
          "tenant_partner_assignments",
          `partner_id=eq.${encodeURIComponent(detailPartnerId)}`,
          { limit: 500, select: "tenant_id,partner_id" }
        )) as Array<{ tenant_id: string; partner_id: string }>
      } catch {
        assignments = []
      }

      let marginRules: MarginRuleRow[] = []
      try {
        marginRules = (await supabaseSelectFilter(
          "saas_partner_margin_rules",
          `partner_id=eq.${encodeURIComponent(detailPartnerId)}`,
          { limit: 50, select: "module_key,margin_pct" }
        )) as MarginRuleRow[]
      } catch {
        marginRules = []
      }

      const employeeIds = (users || []).map((u) => u.employee_id).filter((id) => id > 0)
      let employeeMap = new Map<number, { company: string; store: string; name: string; role: string }>()
      if (employeeIds.length > 0) {
        try {
          const empRows = (await supabaseSelectFilter(
            "employees",
            `id=in.(${employeeIds.join(",")})`,
            { limit: 200, select: "id,company,store,name,role" }
          )) as Array<{ id?: number; company?: string; store?: string; name?: string; role?: string }>
          for (const e of empRows || []) {
            const id = Number(e.id || 0)
            if (id <= 0) continue
            employeeMap.set(id, {
              company: String(e.company || "").trim(),
              store: String(e.store || "").trim(),
              name: String(e.name || "").trim(),
              role: String(e.role || "").trim(),
            })
          }
        } catch {
          employeeMap = new Map()
        }
      }

      return NextResponse.json(
        {
          success: true,
          partner: mapPartner(partner, assignments.length, users.filter((u) => u.is_active !== false).length),
          partnerUsers: (users || []).map((u) => ({
            id: u.id,
            partnerId: u.partner_id,
            employeeId: u.employee_id,
            role: u.role,
            isActive: u.is_active !== false,
            employee: employeeMap.get(u.employee_id) || null,
          })),
          tenantIds: (assignments || []).map((a) => a.tenant_id),
          marginRules: (marginRules || [])
            .filter((r) => SAAS_MODULE_KEYS.includes(r.module_key as SaasModuleKey))
            .map((r) => ({
              moduleKey: r.module_key as SaasModuleKey,
              marginPct: Number(r.margin_pct ?? 0),
            })),
        },
        { headers }
      )
    } catch (error) {
      console.error("saasAdminPartners GET detail:", error)
      return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
    }
  }

  if (cp.scope.kind !== "platform") {
    return NextResponse.json(
      {
        success: true,
        partners: [
          mapPartner(
            {
              id: cp.scope.partnerId,
              name: cp.scope.partnerName,
              default_margin_pct: cp.scope.defaultMarginPct,
              is_active: true,
            },
            0,
            0
          ),
        ],
      },
      { headers }
    )
  }

  try {
    const partners = await loadPartners("", { limit: 500, order: "name.asc" })

    let users: PartnerUserRow[] = []
    try {
      users = (await supabaseSelectFilter("saas_partner_users", "", {
        limit: 2000,
        select: "id,partner_id,employee_id,role,is_active",
      })) as PartnerUserRow[]
    } catch {
      users = []
    }

    let assignments: Array<{ tenant_id: string; partner_id: string }> = []
    try {
      assignments = (await supabaseSelectFilter("tenant_partner_assignments", "", {
        limit: 5000,
        select: "tenant_id,partner_id",
      })) as Array<{ tenant_id: string; partner_id: string }>
    } catch {
      assignments = []
    }

    const tenantCountByPartner = new Map<string, number>()
    for (const a of assignments) {
      const pid = String(a.partner_id || "").trim()
      if (!pid) continue
      tenantCountByPartner.set(pid, (tenantCountByPartner.get(pid) || 0) + 1)
    }

    return NextResponse.json(
      {
        success: true,
        partners: (partners || []).map((p) =>
          mapPartner(
            p,
            tenantCountByPartner.get(p.id) || 0,
            (users || []).filter((u) => u.partner_id === p.id && u.is_active !== false).length
          )
        ),
        partnerUsers: (users || []).map((u) => ({
          id: u.id,
          partnerId: u.partner_id,
          employeeId: u.employee_id,
          role: u.role,
          isActive: u.is_active !== false,
        })),
      },
      { headers }
    )
  } catch (error) {
    console.error("saasAdminPartners GET:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}

type SavePartnerBody = {
  partner?: {
    id: string
    name: string
    defaultMarginPct?: number
    catalogRepricePolicy?: CatalogRepricePolicy
    contactName?: string
    contactPhone?: string
    contactEmail?: string
    billingCompany?: Partial<SaasBillingCompanyInfo>
    isActive?: boolean
    loginAccount?: {
      name: string
      password: string
    }
  }
  linkUser?: {
    partnerId: string
    employeeId: number
  }
  unlinkUser?: {
    partnerUserId: number
  }
  assignTenant?: {
    tenantId: string
    partnerId: string
  }
  unassignTenant?: {
    tenantId: string
  }
  marginRules?: {
    partnerId: string
    rules: Array<{ moduleKey: SaasModuleKey; marginPct: number }>
  }
  catalogRepricePolicy?: {
    partnerId: string
    policy: CatalogRepricePolicy
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse
  if (cp.scope.kind !== "platform") {
    return NextResponse.json({ success: false, message: "대리점 관리는 본사 관리자만 가능합니다." }, { status: 403, headers })
  }

  try {
    const body = (await req.json()) as SavePartnerBody
    const nowIso = new Date().toISOString()

    let createdLoginAccount: { company: string; store: string; name: string; employeeId: number } | null = null

    if (body.partner) {
      const id = String(body.partner.id || "")
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, "-")
      const name = String(body.partner.name || "").trim()
      if (!id || !name) {
        return NextResponse.json({ success: false, message: "partner.id/name이 필요합니다." }, { status: 400, headers })
      }
      await supabaseUpsertMergeWithPgrst204Fallback(
        "saas_partners",
        "id",
        {
          id,
          default_margin_pct: Math.max(0, Number(body.partner.defaultMarginPct ?? 0)),
          catalog_reprice_policy: body.partner.catalogRepricePolicy || "retain_margin_pct",
          is_active: body.partner.isActive !== false,
          updated_at: nowIso,
          ...partnerBillingDbPatch({
            name,
            contactName: body.partner.contactName,
            contactPhone: body.partner.contactPhone,
            contactEmail: body.partner.contactEmail,
            billingCompany: body.partner.billingCompany,
          }),
        },
        "saasAdminPartners save partner"
      )

      const login = body.partner.loginAccount
      const loginName = String(login?.name || "").trim()
      const loginPassword = String(login?.password || "").trim()
      if (loginName || loginPassword) {
        if (!loginName || !loginPassword) {
          return NextResponse.json(
            { success: false, message: "로그인 이름과 비밀번호를 모두 입력해 주세요." },
            { status: 400, headers }
          )
        }
        const account = await createSaasPartnerAdminEmployee({
          name: loginName,
          password: loginPassword,
          company: name,
        })
        await supabaseUpsert(
          "saas_partner_users",
          [
            {
              partner_id: id,
              employee_id: account.employeeId,
              role: "partner_admin",
              is_active: true,
            },
          ],
          "employee_id"
        )
        createdLoginAccount = {
          company: account.company,
          store: account.store,
          name: account.name,
          employeeId: account.employeeId,
        }
      }
    }

    if (body.catalogRepricePolicy) {
      const partnerId = String(body.catalogRepricePolicy.partnerId || "").trim()
      const policy = body.catalogRepricePolicy.policy
      if (!partnerId || !["retain_margin_pct", "retain_margin_amount", "retain_retail"].includes(policy)) {
        return NextResponse.json({ success: false, message: "partnerId/policy가 올바르지 않습니다." }, { status: 400, headers })
      }
      await supabaseUpsertMergeWithPgrst204Fallback(
        "saas_partners",
        "id",
        {
          id: partnerId,
          catalog_reprice_policy: policy,
          updated_at: nowIso,
        },
        "saasAdminPartners catalogRepricePolicy"
      )
    }

    if (body.marginRules) {
      const partnerId = String(body.marginRules.partnerId || "").trim()
      if (!partnerId) {
        return NextResponse.json({ success: false, message: "partnerId가 필요합니다." }, { status: 400, headers })
      }
      const rows = (body.marginRules.rules || [])
        .filter((r) => SAAS_MODULE_KEYS.includes(r.moduleKey))
        .map((r) => ({
          partner_id: partnerId,
          module_key: r.moduleKey,
          margin_pct: Math.max(0, Number(r.marginPct || 0)),
          updated_at: nowIso,
        }))
      if (rows.length > 0) {
        await supabaseUpsert("saas_partner_margin_rules", rows, "partner_id,module_key")
      }
    }

    if (body.linkUser) {
      const partnerId = String(body.linkUser.partnerId || "").trim()
      const employeeId = Math.floor(Number(body.linkUser.employeeId || 0))
      if (!partnerId || employeeId <= 0) {
        return NextResponse.json({ success: false, message: "partnerId/employeeId가 필요합니다." }, { status: 400, headers })
      }
      await supabaseUpsert(
        "saas_partner_users",
        [
          {
            partner_id: partnerId,
            employee_id: employeeId,
            role: "partner_admin",
            is_active: true,
          },
        ],
        "employee_id"
      )
    }

    if (body.unlinkUser) {
      const partnerUserId = Math.floor(Number(body.unlinkUser.partnerUserId || 0))
      if (partnerUserId <= 0) {
        return NextResponse.json({ success: false, message: "partnerUserId가 필요합니다." }, { status: 400, headers })
      }
      const { supabaseDeleteByFilter } = await import("@/lib/supabase-server")
      await supabaseDeleteByFilter("saas_partner_users", `id=eq.${partnerUserId}`)
    }

    if (body.assignTenant) {
      const tenantId = String(body.assignTenant.tenantId || "").trim()
      const partnerId = String(body.assignTenant.partnerId || "").trim()
      if (!tenantId || !partnerId) {
        return NextResponse.json({ success: false, message: "tenantId/partnerId가 필요합니다." }, { status: 400, headers })
      }
      await supabaseUpsert(
        "tenant_partner_assignments",
        [
          {
            tenant_id: tenantId,
            partner_id: partnerId,
            assigned_at: nowIso,
            assigned_by_employee_id: cp.scope.employeeId || null,
          },
        ],
        "tenant_id"
      )
    }

    if (body.unassignTenant) {
      const tenantId = String(body.unassignTenant.tenantId || "").trim()
      if (!tenantId) {
        return NextResponse.json({ success: false, message: "tenantId가 필요합니다." }, { status: 400, headers })
      }
      const { supabaseDeleteByFilter } = await import("@/lib/supabase-server")
      await supabaseDeleteByFilter(
        "tenant_partner_assignments",
        `tenant_id=eq.${encodeURIComponent(tenantId)}`
      )
    }

    return NextResponse.json(
      { success: true, loginAccount: createdLoginAccount },
      { headers }
    )
  } catch (error) {
    console.error("saasAdminPartners POST:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}
