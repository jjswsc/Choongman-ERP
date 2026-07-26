import { NextRequest, NextResponse } from "next/server"
import { assertTenantInScope, requireSaasControlPlane } from "@/lib/saas-control-plane-scope"
import { hashPassword } from "@/lib/password"
import { supabaseInsert, supabaseSelectFilter, supabaseCountFilter } from "@/lib/supabase-server"
import { resolveErpStoreCodeForWrite } from "@/lib/pos-operating-store-code"
import { assertSaasStoreRegistrationAllowed } from "@/lib/saas/saas-store-limit-server"

type Body = {
  tenantId?: string
  storeName?: string
  storeCode?: string
  adminName?: string
  password?: string
  /** 이미 직원이 있어도 추가 (기본 false) */
  allowDuplicate?: boolean
}

/** store_code 미입력이면 store_name 사용. tenant 접두 합성키 금지. */
function resolveBootstrapStoreCode(storeCodeInput: string, storeName: string, tenantId: string): string {
  const resolved = resolveErpStoreCodeForWrite({
    storeCode: storeCodeInput,
    storeName,
    tenantId,
  })
  if (resolved.ok) return resolved.storeCode.slice(0, 64)
  return String(storeName || "store").trim().slice(0, 64)
}

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  const cp = await requireSaasControlPlane(req)
  if (cp.errorResponse) return cp.errorResponse

  try {
    const body = (await req.json()) as Body
    const tenantId = String(body.tenantId || "").trim().toLowerCase()
    const storeName = String(body.storeName || "").trim()
    const adminName = String(body.adminName || "").trim()
    const password = String(body.password || "").trim()
    const storeCodeInput = String(body.storeCode || "").trim()
    const allowDuplicate = body.allowDuplicate === true

    if (!tenantId || !storeName || !adminName || !password) {
      return NextResponse.json(
        { success: false, message: "tenantId, storeName, adminName, password는 필수입니다." },
        { status: 400, headers }
      )
    }
    if (password.length < 4) {
      return NextResponse.json({ success: false, message: "비밀번호는 4자 이상 입력해 주세요." }, { status: 400, headers })
    }

    const tenantRows = (await supabaseSelectFilter("tenants", `id=eq.${encodeURIComponent(tenantId)}`, {
      limit: 1,
      select: "id,company_name,is_active",
    })) as { id?: string; company_name?: string; is_active?: boolean }[]
    const tenant = tenantRows?.[0]
    if (!tenant?.id) {
      return NextResponse.json({ success: false, message: "해당 고객사(tenants)를 찾을 수 없습니다. 먼저 고객사를 생성해 주세요." }, { status: 404, headers })
    }
    if (tenant.is_active === false) {
      return NextResponse.json({ success: false, message: "비활성 고객사에는 계정을 만들 수 없습니다." }, { status: 400, headers })
    }

    const inScope = await assertTenantInScope(cp.scope, tenantId)
    if (!inScope) {
      return NextResponse.json({ success: false, message: "해당 고객사에 접근할 수 없습니다." }, { status: 403, headers })
    }

    const companyName = String(tenant.company_name || "").trim()
    if (!companyName) {
      return NextResponse.json({ success: false, message: "고객사명(company_name)이 비어 있습니다." }, { status: 400, headers })
    }

    const enc = encodeURIComponent(tenantId)
    let existingCount = 0
    try {
      existingCount = await supabaseCountFilter("employees", `tenant_id=eq.${enc}`)
    } catch {
      existingCount = 0
    }
    if (existingCount > 0 && !allowDuplicate) {
      return NextResponse.json(
        {
          success: false,
          code: "EMPLOYEES_EXIST",
          message:
            "이 고객사에 이미 등록된 직원이 있습니다. 초기 계정은 한 번만 만들 수 있습니다. 추가 계정은 해당 고객사로 ERP 로그인 후 직원 메뉴에서 등록하거나, 정말 필요하면 allowDuplicate 옵션으로 진행하세요.",
        },
        { status: 409, headers }
      )
    }

    const dup = (await supabaseSelectFilter(
      "employees",
      `tenant_id=eq.${enc}&name=eq.${encodeURIComponent(adminName)}&store=eq.${encodeURIComponent(storeName)}`,
      { limit: 3, select: "id" }
    )) as { id?: number }[]
    if (dup && dup.length > 0 && !allowDuplicate) {
      return NextResponse.json(
        {
          success: false,
          code: "DUPLICATE_LOGIN_ROW",
          message: "같은 매장·이름 조합의 직원이 이미 있습니다.",
        },
        { status: 409, headers }
      )
    }

    const storeCode = resolveBootstrapStoreCode(storeCodeInput, storeName, tenantId)

    let storeAlreadyExists = false
    try {
      const existingStores = (await supabaseSelectFilter(
        "erp_stores",
        `tenant_id=eq.${encodeURIComponent(tenantId)}&store_code=eq.${encodeURIComponent(storeCode)}`,
        { limit: 1, select: "id" }
      )) as Array<{ id?: number }>
      storeAlreadyExists = Boolean(existingStores?.[0]?.id)
    } catch {
      storeAlreadyExists = false
    }

    if (!storeAlreadyExists) {
      const storeLimit = await assertSaasStoreRegistrationAllowed({
        tenantId,
        companyName,
      })
      if (!storeLimit.ok) {
        return NextResponse.json(
          { success: false, code: storeLimit.code, message: storeLimit.message },
          { status: 403, headers }
        )
      }
    }

    try {
      await supabaseInsert("erp_stores", {
        tenant_id: tenantId,
        store_name: storeName,
        store_code: storeCode,
        is_active: true,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (/(duplicate key|23505|uq_erp_stores)/i.test(msg)) {
        // 이미 같은 매장명이 있으면 직원만 추가
      } else if (/column|42703|does not exist/i.test(msg)) {
        // 레거시 erp_stores 스키마 — 매장 행 생략, 직원 store 문자열만 사용
      } else {
        console.warn("saasBootstrapTenantLogin: erp_stores insert skipped:", msg)
      }
    }

    const hashed = await hashPassword(password)
    const baseRow: Record<string, unknown> = {
      tenant_id: tenantId,
      company: companyName,
      store: storeName,
      name: adminName,
      password: hashed,
      role: "Officer",
      job: "officer",
      nick: adminName,
    }

    let toInsert: Record<string, unknown> = { ...baseRow }
    for (;;) {
      try {
        await supabaseInsert("employees", toInsert)
        break
      } catch (insErr) {
        const em = insErr instanceof Error ? insErr.message : String(insErr)
        if (/attendance_allowance|42703|column/i.test(em) && "attendance_allowance" in toInsert) {
          const { attendance_allowance: _a, ...rest } = toInsert
          toInsert = rest
          continue
        }
        if (/nick|42703|column/i.test(em) && "nick" in toInsert) {
          const { nick: _n, ...rest } = toInsert
          toInsert = rest
          continue
        }
        throw insErr
      }
    }

    return NextResponse.json(
      {
        success: true,
        message: "첫 매장과 초기 관리자 계정을 등록했습니다.",
        tenantId,
        companyName,
        storeName,
        storeCode,
        adminName,
      },
      { headers }
    )
  } catch (error) {
    console.error("saasBootstrapTenantLogin:", error)
    return NextResponse.json({ success: false, message: String(error) }, { status: 500, headers })
  }
}
