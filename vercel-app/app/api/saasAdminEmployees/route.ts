import { NextRequest, NextResponse } from "next/server"
import {
  canAccessSaasAdmin,
  canAssignEmployeeDirectorRole,
  canAssignEmployeeOfficerRole,
  employeeRoleChangeTouchesDirector,
  employeeRoleChangeTouchesOfficer,
} from "@/lib/permissions"
import { requireAuth } from "@/lib/verify-auth"
import { hashPassword } from "@/lib/password"
import {
  supabaseInsert,
  supabaseSelect,
  supabaseSelectFilter,
  supabaseSelectFilterAllPages,
  supabaseSelectFilterRange,
  supabaseSelectPageCap,
  supabaseUpdateByFilter,
} from "@/lib/supabase-server"

export const dynamic = "force-dynamic"

type TenantOpt = { id: string; companyName: string }
type PatchBody = {
  id?: number
  role?: string
  job?: string
  resignDate?: string | null
}
type CreateBody = {
  tenantId?: string
  storeName?: string
  name?: string
  password?: string
  role?: string
  job?: string
}
type EmpPrevRow = {
  id?: number
  role?: string | null
  job?: string | null
  resign_date?: string | null
  tenant_id?: string | null
  company?: string | null
  store?: string | null
  name?: string | null
}

async function loadTenantOptions(): Promise<TenantOpt[]> {
  try {
    const rows = (await supabaseSelect("tenants", {
      order: "company_name.asc",
      limit: 500,
      select: "id,company_name",
    })) as { id?: string; company_name?: string }[]
    return (rows || [])
      .map((r) => ({ id: String(r.id || "").trim(), companyName: String(r.company_name || "").trim() }))
      .filter((t) => t.id)
  } catch {
    return []
  }
}

const EMP_SELECT_FULL =
  "id,tenant_id,company,store,name,role,job,employee_code,resign_date,created_at"
const EMP_SELECT_NO_TID = "id,company,store,name,role,job,employee_code,resign_date,created_at"

export async function GET(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  headers.set("Cache-Control", "no-store")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  try {
    const { searchParams } = new URL(req.url)
    const tenantId = searchParams.get("tenantId")?.trim().toLowerCase() || ""
    const q = searchParams.get("q")?.trim().toLowerCase() || ""
    const offset = Math.min(100_000, Math.max(0, parseInt(searchParams.get("offset") || "0", 10) || 0))
    const limit = Math.min(500, Math.max(1, parseInt(searchParams.get("limit") || "200", 10) || 200))

    const tenantOptions = await loadTenantOptions()
    const cap = Math.min(limit, supabaseSelectPageCap())

    async function loadRaw(): Promise<Record<string, unknown>[]> {
      const companyName = tenantOptions.find((t) => t.id === tenantId)?.companyName?.trim() || ""
      const filterByTenant = tenantId ? `tenant_id=eq.${encodeURIComponent(tenantId)}` : ""
      const filterByCompany = tenantId && companyName ? `company=eq.${encodeURIComponent(companyName)}` : ""

      async function loadAllPagesForSearch(filter: string, select: string): Promise<Record<string, unknown>[]> {
        const f = filter || "id=gte.0"
        try {
          return (await supabaseSelectFilterAllPages("employees", f, {
            order: "id.desc",
            select,
            maxRows: 8000,
            pageSize: 800,
          })) as Record<string, unknown>[]
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (/column|42703|tenant_id/i.test(msg) && filterByCompany) {
            return (await supabaseSelectFilterAllPages("employees", filterByCompany, {
              order: "id.desc",
              select: EMP_SELECT_NO_TID,
              maxRows: 8000,
              pageSize: 800,
            })) as Record<string, unknown>[]
          }
          if (/column|42703/i.test(msg) && select === EMP_SELECT_FULL) {
            return (await supabaseSelectFilterAllPages("employees", f, {
              order: "id.desc",
              select: EMP_SELECT_NO_TID,
              maxRows: 8000,
              pageSize: 800,
            })) as Record<string, unknown>[]
          }
          throw e
        }
      }

      if (q) {
        if (tenantId) {
          return loadAllPagesForSearch(filterByTenant, EMP_SELECT_FULL)
        }
        return loadAllPagesForSearch("id=gte.0", EMP_SELECT_FULL)
      }

      if (tenantId) {
        try {
          return (await supabaseSelectFilterRange("employees", filterByTenant, {
            order: "id.desc",
            select: EMP_SELECT_FULL,
            rangeStart: offset,
            rangeEnd: offset + cap - 1,
          })) as Record<string, unknown>[]
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (/column|42703|tenant_id/i.test(msg) && companyName) {
            return (await supabaseSelectFilterRange("employees", filterByCompany, {
              order: "id.desc",
              select: EMP_SELECT_NO_TID,
              rangeStart: offset,
              rangeEnd: offset + cap - 1,
            })) as Record<string, unknown>[]
          }
          if (/column|42703|tenant_id/i.test(msg)) return []
          throw e
        }
      }
      try {
        return (await supabaseSelect("employees", {
          order: "id.desc",
          offset,
          limit: cap,
          select: EMP_SELECT_FULL,
        })) as Record<string, unknown>[]
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/column|42703/i.test(msg)) {
          return (await supabaseSelect("employees", {
            order: "id.desc",
            offset,
            limit: cap,
            select: EMP_SELECT_NO_TID,
          })) as Record<string, unknown>[]
        }
        throw e
      }
    }

    const raw = await loadRaw()
    const mapped = (Array.isArray(raw) ? raw : []).map((r) => ({
      id: Number(r.id) || 0,
      tenantId: r.tenant_id != null ? String(r.tenant_id).trim() : "",
      company: String(r.company ?? "").trim(),
      store: String(r.store ?? "").trim(),
      name: String(r.name ?? "").trim(),
      role: String(r.role ?? "").trim(),
      job: String(r.job ?? "").trim(),
      employeeCode: r.employee_code != null ? String(r.employee_code).trim() : "",
      resignDate: r.resign_date != null ? String(r.resign_date).trim().slice(0, 10) : "",
      createdAt: String(r.created_at ?? ""),
    }))
    const hasMore = q ? false : mapped.length >= cap
    let rows = mapped
    if (q) {
      rows = mapped.filter((row) => {
        const b = `${row.tenantId} ${row.company} ${row.store} ${row.name} ${row.role} ${row.job} ${row.employeeCode}`.toLowerCase()
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
    console.error("saasAdminEmployees:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}

export async function PATCH(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  try {
    const body = (await req.json()) as PatchBody
    const id = Number(body.id || 0)
    if (!Number.isFinite(id) || id <= 0) {
      return NextResponse.json({ success: false, message: "직원 id가 필요합니다." }, { status: 400, headers })
    }

    const prevRows = (await supabaseSelectFilter("employees", `id=eq.${id}`, {
      limit: 1,
      select: "id,role,job,resign_date,tenant_id,company,store,name",
    })) as EmpPrevRow[]
    const prev = prevRows?.[0]
    if (!prev?.id) {
      return NextResponse.json({ success: false, message: "대상 직원을 찾을 수 없습니다." }, { status: 404, headers })
    }

    const patch: Record<string, unknown> = {}
    const hasRole = typeof body.role === "string"
    const hasJob = typeof body.job === "string"
    const hasResignDate = Object.prototype.hasOwnProperty.call(body, "resignDate")
    if (hasRole) {
      const role = String(body.role || "").trim()
      if (!role) {
        return NextResponse.json({ success: false, message: "role은 비워둘 수 없습니다." }, { status: 400, headers })
      }
      const prevRole = String(prev.role || "").trim()
      const actorRole = authResult.auth.role || ""
      if (employeeRoleChangeTouchesDirector(prevRole, role) && !canAssignEmployeeDirectorRole(actorRole)) {
        return NextResponse.json(
          { success: false, message: "Director 권한 변경은 Director급만 가능합니다." },
          { status: 403, headers }
        )
      }
      if (employeeRoleChangeTouchesOfficer(prevRole, role) && !canAssignEmployeeOfficerRole(actorRole)) {
        return NextResponse.json(
          { success: false, message: "Officer 권한 변경은 Director급 또는 Secretary만 가능합니다." },
          { status: 403, headers }
        )
      }
      patch.role = role
    }
    if (hasJob) {
      patch.job = String(body.job || "").trim()
    }
    if (hasResignDate) {
      const raw = body.resignDate
      const d = raw == null ? "" : String(raw).trim().slice(0, 10)
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) {
        return NextResponse.json({ success: false, message: "resignDate 형식은 YYYY-MM-DD 입니다." }, { status: 400, headers })
      }
      patch.resign_date = d || null
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ success: false, message: "변경할 값이 없습니다." }, { status: 400, headers })
    }

    await supabaseUpdateByFilter("employees", `id=eq.${id}`, patch)
    const actorName = String(authResult.auth.name || "unknown").trim() || "unknown"
    const actorRole = String(authResult.auth.role || "unknown").trim() || "unknown"
    const tenantId = String(prev.tenant_id || "").trim()
    const nextRole = Object.prototype.hasOwnProperty.call(patch, "role") ? String(patch.role || "").trim() : String(prev.role || "").trim()
    const nextJob = Object.prototype.hasOwnProperty.call(patch, "job") ? String(patch.job || "").trim() : String(prev.job || "").trim()
    const nextResign = Object.prototype.hasOwnProperty.call(patch, "resign_date")
      ? (patch.resign_date ? String(patch.resign_date) : "")
      : String(prev.resign_date || "")
    const summaryParts: string[] = []
    if (hasRole) summaryParts.push(`role:${String(prev.role || "-")} -> ${nextRole || "-"}`)
    if (hasJob) summaryParts.push(`job:${String(prev.job || "-")} -> ${nextJob || "-"}`)
    if (hasResignDate) summaryParts.push(`resign:${String(prev.resign_date || "-")} -> ${nextResign || "-"}`)
    const summary =
      summaryParts.length > 0
        ? summaryParts.join(", ")
        : `employee updated (${String(prev.company || "-")} / ${String(prev.store || "-")} / ${String(prev.name || "-")})`
    if (tenantId) {
      try {
        await supabaseInsert("saas_audit_logs", {
          tenant_id: tenantId,
          action: "employee.updated",
          actor_name: actorName,
          actor_role: actorRole,
          summary,
          payload_json: {
            employeeId: id,
            company: String(prev.company || ""),
            store: String(prev.store || ""),
            name: String(prev.name || ""),
            prev: {
              role: String(prev.role || ""),
              job: String(prev.job || ""),
              resignDate: String(prev.resign_date || ""),
            },
            next: {
              role: nextRole,
              job: nextJob,
              resignDate: nextResign,
            },
            changedFields: Object.keys(patch),
          },
          changed_at: new Date().toISOString(),
        })
      } catch (logErr) {
        console.warn("saasAdminEmployees PATCH audit log skipped:", logErr)
      }
    }
    return NextResponse.json({ success: true }, { headers })
  } catch (error) {
    console.error("saasAdminEmployees PATCH:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const authResult = await requireAuth(req, "manager")
  if (authResult.errorResponse) return authResult.errorResponse
  if (!canAccessSaasAdmin(authResult.auth.role || "")) {
    return NextResponse.json({ success: false, message: "SaaS 관리자 권한이 필요합니다." }, { status: 403, headers })
  }

  try {
    const body = (await req.json()) as CreateBody
    const tenantId = String(body.tenantId || "").trim().toLowerCase()
    const storeName = String(body.storeName || "").trim()
    const name = String(body.name || "").trim()
    const rawPassword = String(body.password || "").trim()
    const role = String(body.role || "Manager").trim() || "Manager"
    const job = String(body.job || "manager").trim() || "manager"
    if (!tenantId || !storeName || !name || !rawPassword) {
      return NextResponse.json(
        { success: false, message: "tenantId, storeName, name, password는 필수입니다." },
        { status: 400, headers }
      )
    }
    if (rawPassword.length < 4) {
      return NextResponse.json({ success: false, message: "비밀번호는 4자 이상 입력해 주세요." }, { status: 400, headers })
    }

    const tenantRows = (await supabaseSelectFilter("tenants", `id=eq.${encodeURIComponent(tenantId)}`, {
      limit: 1,
      select: "id,company_name",
    })) as { id?: string; company_name?: string }[]
    const tenant = tenantRows?.[0]
    if (!tenant?.id) {
      return NextResponse.json({ success: false, message: "선택한 고객사를 찾지 못했습니다." }, { status: 404, headers })
    }
    const companyName = String(tenant.company_name || "").trim() || tenantId

    const dup = (await supabaseSelectFilter(
      "employees",
      `tenant_id=eq.${encodeURIComponent(tenantId)}&store=eq.${encodeURIComponent(storeName)}&name=eq.${encodeURIComponent(name)}`,
      { limit: 1, select: "id" }
    )) as { id?: number }[]
    if ((dup || []).length > 0) {
      return NextResponse.json({ success: false, message: "같은 매장·이름의 계정이 이미 존재합니다." }, { status: 409, headers })
    }

    const password = await hashPassword(rawPassword)
    let row: Record<string, unknown> = {
      tenant_id: tenantId,
      company: companyName,
      store: storeName,
      name,
      nick: name,
      password,
      role,
      job,
    }
    for (;;) {
      try {
        await supabaseInsert("employees", row)
        break
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e)
        if (/nick|42703|column/i.test(msg) && "nick" in row) {
          const { nick: _n, ...rest } = row
          row = rest
          continue
        }
        if (/tenant_id|42703|column/i.test(msg) && "tenant_id" in row) {
          const { tenant_id: _t, ...rest } = row
          row = rest
          continue
        }
        if (/company|42703|column/i.test(msg) && "company" in row) {
          const { company: _c, ...rest } = row
          row = rest
          continue
        }
        if (/(duplicate key|23505)/i.test(msg)) {
          return NextResponse.json({ success: false, message: "이미 등록된 계정입니다." }, { status: 409, headers })
        }
        throw e
      }
    }

    try {
      await supabaseInsert("saas_audit_logs", {
        tenant_id: tenantId,
        action: "employee.created",
        actor_name: String(authResult.auth.name || "unknown"),
        actor_role: String(authResult.auth.role || "unknown"),
        summary: `employee created (${companyName} / ${storeName} / ${name}, role=${role})`,
        payload_json: {
          company: companyName,
          store: storeName,
          name,
          role,
          job,
        },
        changed_at: new Date().toISOString(),
      })
    } catch (logErr) {
      console.warn("saasAdminEmployees POST audit log skipped:", logErr)
    }

    return NextResponse.json({ success: true, companyName, storeName, name, role }, { headers })
  } catch (error) {
    console.error("saasAdminEmployees POST:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}
