import { NextRequest, NextResponse } from "next/server"
import { requireAuth } from "@/lib/verify-auth"
import { supabaseSelectFilter, supabaseUpdateByFilter } from "@/lib/supabase-server"
import { shouldEnforceSaasForAuth } from "@/lib/saas/saas-enforce"
import { isServerSaasBrand } from "@/lib/app-brand-server"
import { verifyPassword } from "@/lib/password"
import { normalizeCompanyName, normalizeTenantId } from "@/lib/tenant-context"
import { resolveSaasTenantForLogin } from "@/lib/saas-login-tenant-resolve"
import { supabaseSelectFilterEmployeesByNameForLogin } from "@/lib/employees-compat"
import {
  employeeRowsMatchingSubmittedStore,
  fetchErpStoresMasterForTenant,
  pickBestEmployeeStoreMatch,
} from "@/lib/erp-store-master"
import { loadSaasLoginSecurityPolicy, loadEmployeeTotpSecret } from "@/lib/saas/saas-login-security-server"
import {
  clientIpFromHeaders,
  ipMatchesAllowlist,
  generateTotpSecret,
  verifyTotpCode,
} from "@/lib/saas/saas-login-security"

export const dynamic = "force-dynamic"

type EmpLoginRow = {
  id?: number
  company?: string | null
  store?: string
  name?: string
  password?: string
  tenant_id?: string | null
}

async function resolveOmniEmployeeForBootstrap(params: {
  company?: string
  store: string
  name: string
  pw: string
}): Promise<
  | { ok: true; employeeId: number; tenantId: string; companyName: string; displayName: string }
  | { ok: false; response: NextResponse }
> {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")
  if (!(await isServerSaasBrand())) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "Omni SaaS에서만 사용할 수 있습니다." },
        { status: 400, headers }
      ),
    }
  }
  const companyInput = normalizeCompanyName(params.company)
  if (!companyInput) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, code: "company_required", message: "회사명이 필요합니다." },
        { status: 400, headers }
      ),
    }
  }
  const resolved = await resolveSaasTenantForLogin({ company: companyInput, requireExistingRow: true })
  if (!resolved?.tenantId) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, code: "company_not_found", message: "회사를 찾을 수 없습니다." },
        { status: 404, headers }
      ),
    }
  }
  const masters = await fetchErpStoresMasterForTenant(
    resolved.tenantId,
    resolved.companyName || companyInput
  )
  const byName = (await supabaseSelectFilterEmployeesByNameForLogin(params.name)) as EmpLoginRow[]
  const companyNeedle = companyInput.toLowerCase()
  let scoped = (byName || []).filter(
    (r) => normalizeCompanyName(r.company).toLowerCase() === companyNeedle
  )
  const tid = normalizeTenantId(resolved.tenantId)
  scoped = scoped.filter((r) => {
    const rowTid = normalizeTenantId(r.tenant_id)
    if (!rowTid) return true
    return rowTid === tid
  })
  const matched = employeeRowsMatchingSubmittedStore(scoped, params.store, masters)
  const row = pickBestEmployeeStoreMatch(matched, params.store)
  if (!row) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: "Login Failed" }, { headers }),
    }
  }
  const ok = await verifyPassword(params.pw, String(row.password || "").trim(), {
    allowLegacyPlaintext: false,
  })
  if (!ok) {
    return {
      ok: false,
      response: NextResponse.json({ success: false, message: "Login Failed" }, { headers }),
    }
  }
  const employeeId = row.id != null ? Math.floor(Number(row.id)) : 0
  if (employeeId <= 0) {
    return {
      ok: false,
      response: NextResponse.json(
        { success: false, message: "직원 ID를 확인할 수 없습니다." },
        { status: 400, headers }
      ),
    }
  }
  return {
    ok: true,
    employeeId,
    tenantId: resolved.tenantId,
    companyName: resolved.companyName || companyInput,
    displayName: String(row.name || params.name).trim(),
  }
}

/**
 * Omni 관리자 TOTP 등록/확인.
 * - JWT: enroll | confirm | disable
 * - 비밀번호 bootstrap(2FA 미등록 시): bootstrap_enroll | bootstrap_confirm
 * 충만(JWT tenantId 없음 / 비 SaaS 브랜드)에서는 사용 불가.
 */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set("Access-Control-Allow-Origin", "*")

  try {
    const body = (await req.json()) as {
      action?: string
      totpCode?: string
      company?: string
      store?: string
      name?: string
      pw?: string
    }
    const action = String(body.action || "").trim()

    if (action === "bootstrap_enroll" || action === "bootstrap_confirm") {
      const boot = await resolveOmniEmployeeForBootstrap({
        company: body.company,
        store: String(body.store || "").trim(),
        name: String(body.name || "").trim(),
        pw: String(body.pw || "").trim(),
      })
      if (!boot.ok) return boot.response
      const policy = await loadSaasLoginSecurityPolicy(boot.tenantId)
      if (policy === null) {
        return NextResponse.json(
          {
            success: false,
            code: "saas_login_policy_unavailable",
            message: "로그인 보안 정책을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.",
          },
          { status: 503, headers }
        )
      }
      if (!policy.require2faAdmin) {
        return NextResponse.json(
          {
            success: false,
            message: "이 고객사는 관리자 2FA가 필수가 아닙니다. 로그인 후 등록하세요.",
          },
          { status: 400, headers }
        )
      }
      if (policy.requireIpAllowlist) {
        if (policy.allowedIps.length === 0) {
          return NextResponse.json(
            {
              success: false,
              code: "ip_allowlist_empty",
              message: "IP 허용 목록이 비어 있습니다. SaaS 관리자에게 문의하세요.",
            },
            { status: 403, headers }
          )
        }
        const clientIp = clientIpFromHeaders(req.headers)
        if (!ipMatchesAllowlist(clientIp, policy.allowedIps)) {
          return NextResponse.json(
            {
              success: false,
              code: "ip_not_allowed",
              message: "허용되지 않은 IP입니다.",
            },
            { status: 403, headers }
          )
        }
      }
      if (action === "bootstrap_enroll") {
        const existing = await loadEmployeeTotpSecret(boot.employeeId)
        if (existing?.enabled && existing.secret) {
          return NextResponse.json(
            {
              success: false,
              code: "2fa_already_enabled",
              message: "이미 2FA가 활성화되어 있습니다. 재등록은 disable 후 진행하세요.",
            },
            { status: 409, headers }
          )
        }
        const secret = generateTotpSecret()
        await supabaseUpdateByFilter("employees", `id=eq.${boot.employeeId}`, {
          totp_secret: secret,
          totp_enabled: false,
        })
        const label = encodeURIComponent(`${boot.companyName}:${boot.displayName}`)
        const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=OmniERP&digits=6&period=30`
        return NextResponse.json(
          {
            success: true,
            secret,
            otpauthUrl: otpauth,
            message: "Authenticator에 등록 후 bootstrap_confirm으로 활성화하세요.",
          },
          { headers }
        )
      }
      const rows = (await supabaseSelectFilter("employees", `id=eq.${boot.employeeId}`, {
        limit: 1,
        select: "totp_secret",
      })) as Array<{ totp_secret?: string | null }>
      const secret = String(rows?.[0]?.totp_secret || "").trim()
      if (!secret) {
        return NextResponse.json(
          { success: false, message: "먼저 bootstrap_enroll을 실행하세요." },
          { status: 400, headers }
        )
      }
      if (!verifyTotpCode(secret, String(body.totpCode || ""))) {
        return NextResponse.json(
          { success: false, code: "2fa_invalid", message: "인증번호가 올바르지 않습니다." },
          { status: 400, headers }
        )
      }
      await supabaseUpdateByFilter("employees", `id=eq.${boot.employeeId}`, { totp_enabled: true })
      return NextResponse.json({ success: true, enabled: true }, { headers })
    }

    const authResult = await requireAuth(req, "any")
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set("Access-Control-Allow-Origin", "*")
      return authResult.errorResponse
    }
    const auth = authResult.auth!
    if (!shouldEnforceSaasForAuth(auth.tenantId)) {
      return NextResponse.json(
        { success: false, message: "Omni SaaS 계정에서만 사용할 수 있습니다." },
        { status: 400, headers }
      )
    }
    const employeeId = auth.employeeId != null ? Math.floor(Number(auth.employeeId)) : 0
    if (employeeId <= 0) {
      return NextResponse.json(
        { success: false, message: "직원 ID가 없습니다. 다시 로그인해 주세요." },
        { status: 400, headers }
      )
    }

    if (action === "enroll") {
      const existing = await loadEmployeeTotpSecret(employeeId)
      if (existing?.enabled && existing.secret) {
        return NextResponse.json(
          {
            success: false,
            code: "2fa_already_enabled",
            message: "이미 2FA가 활성화되어 있습니다. 재등록은 disable 후 진행하세요.",
          },
          { status: 409, headers }
        )
      }
      const secret = generateTotpSecret()
      await supabaseUpdateByFilter("employees", `id=eq.${employeeId}`, {
        totp_secret: secret,
        totp_enabled: false,
      })
      const company = String(auth.company || auth.tenantId || "Omni").trim()
      const label = encodeURIComponent(`${company}:${auth.name || employeeId}`)
      const otpauth = `otpauth://totp/${label}?secret=${secret}&issuer=OmniERP&digits=6&period=30`
      return NextResponse.json(
        {
          success: true,
          secret,
          otpauthUrl: otpauth,
          message: "Authenticator에 등록 후 confirm으로 활성화하세요.",
        },
        { headers }
      )
    }
    if (action === "confirm") {
      const rows = (await supabaseSelectFilter("employees", `id=eq.${employeeId}`, {
        limit: 1,
        select: "totp_secret",
      })) as Array<{ totp_secret?: string | null }>
      const secret = String(rows?.[0]?.totp_secret || "").trim()
      if (!secret) {
        return NextResponse.json(
          { success: false, message: "먼저 enroll을 실행하세요." },
          { status: 400, headers }
        )
      }
      if (!verifyTotpCode(secret, String(body.totpCode || ""))) {
        return NextResponse.json(
          { success: false, code: "2fa_invalid", message: "인증번호가 올바르지 않습니다." },
          { status: 400, headers }
        )
      }
      await supabaseUpdateByFilter("employees", `id=eq.${employeeId}`, { totp_enabled: true })
      return NextResponse.json({ success: true, enabled: true }, { headers })
    }
    if (action === "disable") {
      const rows = (await supabaseSelectFilter("employees", `id=eq.${employeeId}`, {
        limit: 1,
        select: "totp_secret,totp_enabled",
      })) as Array<{ totp_secret?: string | null; totp_enabled?: boolean | null }>
      const secret = String(rows?.[0]?.totp_secret || "").trim()
      if (rows?.[0]?.totp_enabled && secret) {
        if (!verifyTotpCode(secret, String(body.totpCode || ""))) {
          return NextResponse.json(
            { success: false, code: "2fa_invalid", message: "인증번호가 올바르지 않습니다." },
            { status: 400, headers }
          )
        }
      }
      await supabaseUpdateByFilter("employees", `id=eq.${employeeId}`, {
        totp_secret: null,
        totp_enabled: false,
      })
      return NextResponse.json({ success: true, enabled: false }, { headers })
    }
    return NextResponse.json(
      { success: false, message: "action must be enroll|confirm|disable|bootstrap_enroll|bootstrap_confirm" },
      { status: 400, headers }
    )
  } catch (e) {
    console.error("saasAdminTotp:", e)
    return NextResponse.json({ success: false, message: String(e) }, { status: 500, headers })
  }
}
