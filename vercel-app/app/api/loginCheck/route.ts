import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilterEmployeesByNameForLogin } from '@/lib/employees-compat'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { signToken } from '@/lib/jwt-auth'
import { verifyPassword } from '@/lib/password'
import { parseOr400, loginSchema } from '@/lib/api-validate'
import { isOfficeStore, resolveAuthRoleFromEmployeeRoleColumn } from '@/lib/permissions'
import { normalizeCompanyName, normalizeTenantId } from '@/lib/tenant-context'
import { buildAllowedStoresForToken } from '@/lib/franchisee-multi-store'
import { getFranchiseeMultiStoreSettings } from '@/lib/franchisee-multi-store-settings-server'
import { parseExtraStoresColumn } from '@/lib/extra-stores-column'
import { buildSetAuthCookieHeader } from '@/lib/auth-cookie'
import {
  employeeRowsMatchingSubmittedStore,
  fetchErpStoresMaster,
  fetchErpStoresMasterForTenant,
  pickBestEmployeeStoreMatch,
} from '@/lib/erp-store-master'
import { loginCheckFailureFromError } from '@/lib/login-check-error'
import { isEmployeeOfficePayrollManagerFlag } from '@/lib/office-payroll-access'
import { resolveSaasScope, type SaasScope } from '@/lib/saas-control-plane-scope'
import { isSaasPartnerLoginStore } from '@/lib/saas-partner-login-defaults'
import { loadSaasEnabledModulesForAuth } from '@/lib/saas/tenant-module-gate'
import { isServerSaasBrand } from '@/lib/app-brand-server'
import { resolveSaasTenantForLogin } from '@/lib/saas-login-tenant-resolve'
import { loadSaasLoginSecurityPolicy } from '@/lib/saas/saas-login-security-server'
import { clientIpFromHeaders, ipMatchesAllowlist } from '@/lib/saas/saas-login-security'
import { todayStrBangkok } from '@/lib/attendance-utils'

export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS')
  headers.set('Access-Control-Allow-Headers', 'Content-Type')

  try {
    const body = await req.json()
    const validated = parseOr400(loginSchema, { ...body, isAdminPage: body.isAdminPage !== false }, headers)
    if (validated.errorResponse) return validated.errorResponse
    const { company, store, name, pw, isAdminPage } = validated.parsed
    const companyInput = normalizeCompanyName(company)
    const saasBrand = await isServerSaasBrand()
    const partnerStoreHint = isSaasPartnerLoginStore(store)

    /** Omni 일반 로그인: 회사명 필수 (타사 동명이인 교차 로그인 방지) */
    if (saasBrand && !partnerStoreHint && !companyInput) {
      return NextResponse.json(
        { success: false, message: '회사명을 입력해 주세요.', code: 'company_required' },
        { headers }
      )
    }

    const resolvedTenant =
      saasBrand && companyInput && !partnerStoreHint
        ? await resolveSaasTenantForLogin({ company: companyInput, requireExistingRow: true })
        : null

    type EmpLoginRow = {
      id?: number
      employee_code?: string | null
      company?: string | null
      store?: string
      name?: string
      password?: string
      role?: string
      job?: string
      resign_date?: string | null
      deleted_at?: string | null
      extra_stores?: unknown
      can_manage_office_payroll?: boolean | null
      tenant_id?: string | null
    }
    /** 직원·매장 마스터는 서로 독립 → 병렬로 왕복 1회 절감 */
    const [byName, masters] = await Promise.all([
      supabaseSelectFilterEmployeesByNameForLogin(name) as Promise<EmpLoginRow[]>,
      resolvedTenant?.tenantId
        ? fetchErpStoresMasterForTenant(resolvedTenant.tenantId, resolvedTenant.companyName || companyInput)
        : fetchErpStoresMaster(),
    ])
    const companyNeedle = companyInput.toLowerCase()
    const byCompany = companyInput
      ? (byName || []).filter((r) => normalizeCompanyName(r.company).toLowerCase() === companyNeedle)
      : []
    /**
     * 회사명을 보냈으면 반드시 회사로 좁힌다.
     * (이전: 회사 불일치 시 전 테넌트 동명이인으로 폴백 → Omni 교차 로그인 위험)
     */
    let scopedRows: EmpLoginRow[] = companyInput ? byCompany : byName || []
    if (resolvedTenant?.tenantId) {
      const tid = normalizeTenantId(resolvedTenant.tenantId)
      const withTenant = scopedRows.filter((r) => {
        const rowTid = normalizeTenantId(r.tenant_id)
        if (!rowTid) return true
        return rowTid === tid
      })
      if (withTenant.length > 0) scopedRows = withTenant
    }
    const matched = employeeRowsMatchingSubmittedStore(scopedRows, store, masters)
    const row = pickBestEmployeeStoreMatch(matched, store)
    if (!row) {
      return NextResponse.json({ success: false, message: 'Login Failed' }, { headers })
    }
    if (String(row.deleted_at || '').trim()) {
      return NextResponse.json({ success: false, message: '퇴사된 계정은 사용할 수 없습니다.' }, { headers })
    }
    const resignStr = row.resign_date ? String(row.resign_date).trim().slice(0, 10) : ''
    if (resignStr) {
      /** 퇴사 당일까지는 로그인 허용(마지막 근무일). soft-delete는 위에서 즉시 차단 */
      const todayStr = todayStrBangkok()
      if (todayStr > resignStr) {
        return NextResponse.json({ success: false, message: '퇴사된 계정은 사용할 수 없습니다.' }, { headers })
      }
    }
    const storedPw = String(row.password || '').trim()
    const ok = await verifyPassword(pw, storedPw, {
      /** Omni: 평문 저장 계정 로그인 거부. 충만만 레거시 평문 허용. */
      allowLegacyPlaintext: !saasBrand,
    })
    if (!ok) {
      return NextResponse.json({ success: false, message: 'Login Failed' }, { headers })
    }

    /** Omni: tenants.is_active=false 이면 토큰 발급 차단 */
    if (saasBrand && resolvedTenant && resolvedTenant.isActive === false) {
      return NextResponse.json(
        {
          success: false,
          message: '이용이 중지된 고객사입니다. 본사/SaaS 관리자에게 문의하세요.',
          code: 'tenant_suspended',
        },
        { headers }
      )
    }

    const storeName = String(row.store || '').trim()
    const empIsOfficeStore = isOfficeStore(storeName)
    /** 권한(role) 우선 — 직무(job)는 Staff 등 미지정일 때만 합산. role=Franchisee·job=Director 오설정 방지 */
    const fromRoleColumn = resolveAuthRoleFromEmployeeRoleColumn(String(row.role || ''))
    let finalRole = fromRoleColumn || 'staff'
    if (!fromRoleColumn) {
      const rawRole = `${String(row.role || '').trim()} ${String(row.job || '').trim()}`
        .toLowerCase()
        .replace(/\./g, '')
        .replace(/\s+/g, ' ')
        .trim()
      if (rawRole.includes('director') || rawRole.includes('ceo') || rawRole.includes('대표')) finalRole = 'director'
      else if (rawRole === 'hr' || rawRole.includes('인사') || /\bhr\b/.test(rawRole)) finalRole = 'hr'
      else if (rawRole.includes('secretary') || rawRole.includes('비서')) finalRole = 'secretary'
      else if (rawRole.includes('supervisor') || rawRole.includes('슈퍼바이저')) finalRole = 'supervisor'
      else if (rawRole.includes('officer') || rawRole.includes('총괄') || rawRole.includes('오피스')) finalRole = 'officer'
      else if (rawRole.includes('manager') || rawRole.includes('점장') || rawRole.includes('매니저')) finalRole = 'manager'
      else if (rawRole.includes('franchisee') || rawRole.includes('가맹') || rawRole.includes('점주')) finalRole = 'franchisee'
      else if (rawRole.includes('accounting') || rawRole.includes('회계')) finalRole = 'accounting'
      else if (empIsOfficeStore) finalRole = 'officer' // store=Office → Officer로 인식
    }

    // 관리자 페이지: 본사·매장 관리·회계 등 허용 역할만. 일반 직원(staff)은 차단
    const adminAllowed = new Set(['director', 'secretary', 'officer', 'ceo', 'hr', 'manager', 'franchisee', 'accounting', 'supervisor'])
    if (isAdminPage && !adminAllowed.has(finalRole)) {
      return NextResponse.json({ success: false, message: '관리자 권한이 없습니다.' }, { headers })
    }

    /**
     * Omni: IP allowlist (tenant_policy_settings).
     * 충만(tenant 없음) 또는 정책 조회 실패(SQL 미배포) 시 —
     * require 플래그가 켜져 있는데 조회 실패면 fail-closed.
     */
    const earlyTenantId =
      saasBrand && !partnerStoreHint
        ? resolvedTenant?.tenantId ||
          normalizeTenantId(row.tenant_id) ||
          undefined
        : undefined
    if (saasBrand && earlyTenantId) {
      const policy = await loadSaasLoginSecurityPolicy(earlyTenantId)
      /** 정책 조회 실패(null) → fail-closed. 행 없음은 플래그 OFF 객체로 반환됨. */
      if (policy === null) {
        return NextResponse.json(
          {
            success: false,
            code: 'saas_login_policy_unavailable',
            message: '로그인 보안 정책을 확인할 수 없습니다. 잠시 후 다시 시도해 주세요.',
          },
          { status: 503, headers }
        )
      }
      if (policy.requireIpAllowlist) {
        if (policy.allowedIps.length === 0) {
          return NextResponse.json(
            {
              success: false,
              code: 'ip_allowlist_empty',
              message: 'IP 허용 목록이 비어 있습니다. SaaS 관리자에게 문의하세요.',
            },
            { headers }
          )
        }
        const clientIp = clientIpFromHeaders(req.headers)
        if (!ipMatchesAllowlist(clientIp, policy.allowedIps)) {
          return NextResponse.json(
            {
              success: false,
              code: 'ip_not_allowed',
              message: '허용되지 않은 IP입니다.',
            },
            { headers }
          )
        }
      }
    }

    const userName = String(row.name || '').trim()
    const companyName =
      normalizeCompanyName(row.company) ||
      normalizeCompanyName(resolvedTenant?.companyName) ||
      companyInput
    const empIdRaw = row.id != null ? Math.floor(Number(row.id)) : 0
    /**
     * 일반 ERP/POS 매장 로그인은 SaaS 파트너 스코프 DB를 건너뜀.
     * Partner 매장(SaaS 콘솔)일 때만 resolveSaasScope 호출.
     */
    const scopeAuth = {
      store: storeName,
      name: userName,
      role: finalRole,
      ...(empIdRaw > 0 ? { employeeId: empIdRaw } : {}),
      ...(companyName ? { company: companyName } : {}),
    }
    const [partnerScope, multiSettings] = await Promise.all([
      isSaasPartnerLoginStore(storeName)
        ? resolveSaasScope(scopeAuth)
        : Promise.resolve({
            kind: 'platform' as const,
            employeeId: empIdRaw,
            employeeName: userName,
          } satisfies SaasScope),
      getFranchiseeMultiStoreSettings(),
    ])
    const saasPartnerLogin = partnerScope.kind === 'partner'
    /**
     * JWT tenantId 는 tenants.id 만. employee.tenant_id 슬러그(abc-company)나
     * deriveTenantIdFromCompany 폴백을 그대로 넣으면 getPosMenus 가 0건이 된다.
     * 회사명으로 이미 확정됐으면(resolvedTenant) 재조회하지 않는다 — 교차로그인 방지 유지.
     */
    let tenantId: string | undefined
    if (!saasPartnerLogin) {
      tenantId = resolvedTenant?.tenantId || undefined
      if (!tenantId) {
        const fromEmpOrCompany = await resolveSaasTenantForLogin({
          tenantId: row.tenant_id,
          company: companyName || companyInput,
          requireExistingRow: true,
        })
        tenantId = fromEmpOrCompany?.tenantId || undefined
      }
    }
    const extraParsed = parseExtraStoresColumn(row.extra_stores)
    const allowedStores = buildAllowedStoresForToken(storeName, extraParsed, multiSettings, finalRole)
    const empCodeRaw = row.employee_code != null ? String(row.employee_code).trim() : ''
    let canManageOfficePayroll = isEmployeeOfficePayrollManagerFlag(row.can_manage_office_payroll)

    const payrollFlagPromise =
      !canManageOfficePayroll && empIdRaw > 0
        ? (async () => {
            try {
              const flagRows = (await supabaseSelectFilter('employees', `id=eq.${empIdRaw}`, {
                limit: 1,
                select: 'can_manage_office_payroll',
              })) as { can_manage_office_payroll?: unknown }[]
              return isEmployeeOfficePayrollManagerFlag(flagRows?.[0]?.can_manage_office_payroll)
            } catch {
              return false
            }
          })()
        : Promise.resolve(canManageOfficePayroll)

    /** 로그인 직후 enabled-modules 왕복을 없애기 위해 응답에 모듈 맵을 함께 반환 */
    const [payrollFlag, enabledModules] = await Promise.all([
      payrollFlagPromise,
      loadSaasEnabledModulesForAuth({
        store: storeName,
        name: userName,
        role: finalRole,
        ...(tenantId ? { tenantId } : {}),
        ...(companyName ? { company: companyName } : {}),
        ...(empIdRaw > 0 ? { employeeId: empIdRaw } : {}),
      }),
    ])
    canManageOfficePayroll = payrollFlag

    const tokenPayload: Parameters<typeof signToken>[0] = { store: storeName, name: userName, role: finalRole }
    if (empIdRaw > 0) tokenPayload.employeeId = empIdRaw
    if (empCodeRaw) tokenPayload.employeeCode = empCodeRaw
    if (canManageOfficePayroll) tokenPayload.canManageOfficePayroll = true
    if (companyName) tokenPayload.company = companyName
    if (tenantId) tokenPayload.tenantId = tenantId
    const attachAllowedStores =
      allowedStores.length > 0 &&
      ((finalRole === 'franchisee' && multiSettings.enabled) || finalRole === 'supervisor')
    if (attachAllowedStores) {
      tokenPayload.allowedStores = allowedStores
    }
    const token = await signToken(tokenPayload)

    headers.append('Set-Cookie', buildSetAuthCookieHeader(token))

    return NextResponse.json(
      {
        success: true,
        storeName,
        userName,
        role: finalRole,
        token,
        enabledModules,
        ...(companyName ? { companyName } : {}),
        ...(tenantId ? { tenantId } : {}),
        ...(empIdRaw > 0 ? { employeeId: empIdRaw } : {}),
        ...(empCodeRaw ? { employeeCode: empCodeRaw } : {}),
        ...(canManageOfficePayroll ? { canManageOfficePayroll: true } : {}),
        ...(attachAllowedStores ? { allowedStores } : {}),
        ...(saasPartnerLogin ? { saasPartnerLogin: true } : {}),
      },
      { headers }
    )
  } catch (e) {
    console.error('loginCheck:', e)
    const { message, code } = loginCheckFailureFromError(e)
    return NextResponse.json(
      { success: false, message, ...(code ? { code } : {}) },
      { headers: new Headers({ 'Access-Control-Allow-Origin': '*' }) }
    )
  }
}
