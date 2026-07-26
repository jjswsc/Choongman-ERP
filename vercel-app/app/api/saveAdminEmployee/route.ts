import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { hashPassword, isHashed } from '@/lib/password'
import {
  isAccountingRole,
  isFranchiseeRole,
  canAssignEmployeeDirectorRole,
  canAssignEmployeeOfficerRole,
  employeeRoleChangeTouchesDirector,
  employeeRoleChangeTouchesOfficer,
} from '@/lib/permissions'
import { requireAuth } from '@/lib/verify-auth'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'
import {
  employeeScopeAllowedStoresFromJwt,
  franchiseeQueryStoreAllowed,
  rowRoleLooksFranchisee,
  normalizeFranchiseeExtraStores,
} from '@/lib/franchisee-multi-store'
import { getFranchiseeMultiStoreSettings } from '@/lib/franchisee-multi-store-settings-server'
import { normalizeEmployeeCodeForMatch, normalizeEmployeeNameFields } from '@/lib/employee-display-name'
import { effectiveHazardAllowanceForJob } from '@/lib/employee-job-rules'
import {
  actorFromJwt,
  fetchEmployeeAuditSnapshot,
  sanitizeEmployeeAuditRow,
  writeEmployeeAudit,
} from '@/lib/employee-audit'
import { isEmployeeOfficePayrollManagerFlag, preserveOfficeEmployeePayrollOnSave } from '@/lib/office-payroll-access'
import { resolveCanManageOfficePayrollAuth } from '@/lib/office-payroll-auth-server'
import {
  appendSaasTenantFilter,
  assertSaasTenantWritable,
  resolveSaasTenantScope,
  stampSaasTenantId,
  type SaasTenantScope,
} from '@/lib/saas-tenant-scope'
import { assertSaasStaffRegistrationAllowed } from '@/lib/saas/saas-staff-limit-server'
import {
  assertSaasManagerRegistrationAllowed,
  roleCountsAsManagerSeat,
} from '@/lib/saas/saas-manager-limit-server'

const EMPLOYEE_CODE_RE = /^[A-Z]{2}\d{3}$/
const EMPLOYMENT_STATUS_VALUES = new Set(['active', 'leave', 'resigned', 'suspended'])

function toDateStr(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') {
    const s = val.trim().slice(0, 10)
    return s || null
  }
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
}

function bangkokTodayDateStr(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

function normalizeEmploymentStatus(val: unknown, resignDate: unknown): 'active' | 'leave' | 'resigned' | 'suspended' {
  const today = bangkokTodayDateStr()
  const resignDateStr = toDateStr(resignDate)
  const raw = String(val || '')
    .trim()
    .toLowerCase()
  if (EMPLOYMENT_STATUS_VALUES.has(raw)) {
    if (raw === 'resigned' && resignDateStr && resignDateStr > today) return 'active'
    return raw as 'active' | 'leave' | 'resigned' | 'suspended'
  }
  if (!resignDateStr) return 'active'
  return resignDateStr <= today ? 'resigned' : 'active'
}

function normalizePhoneForMatch(raw: unknown): string {
  return String(raw || '').replace(/\D/g, '')
}

function storePrefixFromName(storeName: string): string {
  const alpha = String(storeName || '')
    .toUpperCase()
    .replace(/[^A-Z]/g, '')
  if (alpha.length >= 2) return alpha.slice(0, 2)
  if (alpha.length === 1) return `${alpha}X`
  return 'ST'
}

function prefixCandidatesForStore(storeName: string): string[] {
  const raw = String(storeName || '').trim()
  const letters = raw.toUpperCase().replace(/[^A-Z]/g, '')
  const out: string[] = []
  const seen = new Set<string>()
  const push = (p: string) => {
    const v = String(p || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 2)
    if (v.length !== 2) return
    if (seen.has(v)) return
    seen.add(v)
    out.push(v)
  }

  // 1) 매장명에서 추출한 연속 알파벳 2글자 (순서 유지, CM Tower → CM, MT, …)
  if (letters.length >= 2) {
    for (let i = 0; i < letters.length - 1; i++) {
      push(`${letters[i]}${letters[i + 1]}`)
    }
  }

  // 2) 맨 앞 2글자 (1)과 겹칠 수 있으나 우선순위 고정용
  push(storePrefixFromName(raw))

  // 3) 공백으로 나뉜 단어들에서 알파벳 첫 글자만 모아 앞 2글자 (SQL cm_erp_emp_prefix_candidates 와 동일)
  const words = raw.split(/\s+/).filter(Boolean)
  let ini = ''
  for (let wi = 0; wi < Math.min(words.length, 4); wi++) {
    const a = words[wi].toUpperCase().replace(/[^A-Z]/g, '')
    if (a.length >= 1) ini += a[0]
    if (ini.length >= 2) break
  }
  if (ini.length >= 2) push(`${ini[0]}${ini[1]}`)

  // 4) 같은 매장 문자열에서 나올 수 있는 모든 알파벳 쌍 (이름 연관도↑, 충돌 시 뒤쪽 후보 사용)
  if (letters.length >= 2) {
    for (let i = 0; i < letters.length; i++) {
      for (let j = i + 1; j < letters.length; j++) {
        push(`${letters[i]}${letters[j]}`)
      }
    }
  }

  // 5) 첫 글자 + 마지막 글자
  if (letters.length >= 2) {
    push(`${letters[0]}${letters[letters.length - 1]}`)
  }

  if (letters.length === 1) {
    push(`${letters}X`)
    for (let j = 0; j < 26; j++) push(`${letters}${String.fromCharCode(65 + j)}`)
  }

  if (!letters.length) {
    push('ST')
  }

  // 6) 최후 수단: AA–ZZ (매장명과 무관하지만 전역 충돌 시에만 뒤에서 선택됨)
  for (let i = 0; i < 26; i++) {
    for (let j = 0; j < 26; j++) {
      push(`${String.fromCharCode(65 + i)}${String.fromCharCode(65 + j)}`)
    }
  }
  return out
}

function normalizeEmployeeCodeInput(raw: unknown): string {
  return String(raw ?? '')
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .slice(0, 5)
}

async function buildNextEmployeeCodeForStore(storeName: string, tenantScope: SaasTenantScope): Promise<string> {
  let rows: { store?: string | null; employee_code?: string | null }[] = []
  try {
    rows = (await supabaseSelectFilter('employees', appendSaasTenantFilter('id=gt.0', tenantScope, 'employees'), {
      select: 'store,employee_code',
      limit: 5000,
      order: 'id.asc',
    })) as { store?: string | null; employee_code?: string | null }[]
  } catch (e) {
    const em = e instanceof Error ? e.message : String(e)
    if (/employee_code|42703|column/i.test(em)) return `${storePrefixFromName(storeName)}001`
    throw e
  }
  const targetStore = String(storeName || '').trim()
  const usedPrefixesByOtherStore = new Set<string>()
  const validPrefixCountInTarget = new Map<string, number>()
  const targetRows: string[] = []
  for (const r of rows || []) {
    const rowStore = String(r.store || '').trim()
    const c = normalizeEmployeeCodeInput(r.employee_code)
    if (!EMPLOYEE_CODE_RE.test(c)) continue
    const pfx = c.slice(0, 2)
    if (rowStore && rowStore.toLowerCase() === targetStore.toLowerCase()) {
      validPrefixCountInTarget.set(pfx, (validPrefixCountInTarget.get(pfx) || 0) + 1)
      targetRows.push(c)
    } else {
      usedPrefixesByOtherStore.add(pfx)
    }
  }
  let prefix = ''
  if (validPrefixCountInTarget.size > 0) {
    const sorted = Array.from(validPrefixCountInTarget.entries()).sort((a, b) => {
      if (b[1] !== a[1]) return b[1] - a[1]
      return a[0].localeCompare(b[0])
    })
    prefix = sorted[0][0]
  } else {
    const cands = prefixCandidatesForStore(storeName)
    prefix = cands.find((p) => !usedPrefixesByOtherStore.has(p)) || cands[0] || 'ST'
  }
  const used = new Set<number>()
  for (const c of targetRows) {
    if (!c.startsWith(prefix)) continue
    const n = Number(c.slice(2))
    if (Number.isFinite(n) && n >= 1 && n <= 999) used.add(n)
  }
  for (let i = 1; i <= 999; i++) {
    if (!used.has(i)) return `${prefix}${String(i).padStart(3, '0')}`
  }
  throw new Error(`매장(${storeName}) 직원코드가 999명을 초과했습니다.`)
}

/** 직원 저장 (신규/수정) */
export async function POST(req: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const authResult = await requireAuth(req, 'manager')
    if (authResult.errorResponse) {
      authResult.errorResponse.headers.set('Access-Control-Allow-Origin', '*')
      return authResult.errorResponse
    }
    const auth = authResult.auth
    const tenantScope = await resolveSaasTenantScope({ auth })
    const tenantError = assertSaasTenantWritable(tenantScope, {
      tableHint: 'employees',
      label: '직원',
    })
    if (tenantError) {
      return NextResponse.json({ success: false, message: tenantError }, { status: 403, headers })
    }
    const body = await req.json()
    const d = body.d || body
    const userStore = String(auth.store || '').trim()
    const userRole = String(auth.role || '').toLowerCase()
    const jwt = auth
    const effectiveRole = String(jwt?.role || userRole).toLowerCase()
    const payrollAuth = await resolveCanManageOfficePayrollAuth(auth)

    const isTop =
      ['director', 'secretary', 'officer', 'ceo', 'hr'].some((r) => effectiveRole.includes(r)) || isAccountingRole(effectiveRole)
    const scopeAllowedList = employeeScopeAllowedStoresFromJwt(jwt)

    if (!isTop) {
      if (jwt && isFranchiseeRole(effectiveRole) && !franchiseeQueryStoreAllowed(jwt, userStore)) {
        return NextResponse.json(
          { success: false, message: '❌ 선택한 매장에 대한 권한이 없습니다.' },
          { status: 403, headers }
        )
      }
      const targetStore = String(d.store || '').trim()
      if (
        !userCanAccessEmployeeStore(effectiveRole, userStore, targetStore, {
          allowedStores: scopeAllowedList,
        })
      ) {
        return NextResponse.json(
          { success: false, message: '❌ 해당 매장 직원만 수정할 수 있습니다.' },
          { headers }
        )
      }
    }

    const rowIdForRole = Number(d.row)
    const requestedRole = String(d.role || 'Staff').trim()
    const actorRole = effectiveRole
    if (rowIdForRole === 0) {
      if (employeeRoleChangeTouchesDirector('', requestedRole) && !canAssignEmployeeDirectorRole(actorRole)) {
        return NextResponse.json(
          {
            success: false,
            message: '❌ Director 역할은 Director급만 지정할 수 있습니다.',
          },
          { status: 403, headers }
        )
      }
      if (employeeRoleChangeTouchesOfficer('', requestedRole) && !canAssignEmployeeOfficerRole(actorRole)) {
        return NextResponse.json(
          {
            success: false,
            message: '❌ Officer 역할은 Director급만 지정할 수 있습니다.',
          },
          { status: 403, headers }
        )
      }
    } else {
      const prevRows = (await supabaseSelectFilter('employees', appendSaasTenantFilter(`id=eq.${rowIdForRole}`, tenantScope, 'employees'), {
        limit: 1,
        select: 'role',
      })) as { role?: string | null }[]
      const prevRole = prevRows?.[0]?.role != null ? String(prevRows[0].role) : ''
      if (employeeRoleChangeTouchesDirector(prevRole, requestedRole) && !canAssignEmployeeDirectorRole(actorRole)) {
        return NextResponse.json(
          {
            success: false,
            message: '❌ Director 역할은 Director급만 변경·지정할 수 있습니다.',
          },
          { status: 403, headers }
        )
      }
      if (employeeRoleChangeTouchesOfficer(prevRole, requestedRole) && !canAssignEmployeeOfficerRole(actorRole)) {
        return NextResponse.json(
          {
            success: false,
            message: '❌ Officer 역할은 Director급만 변경·지정할 수 있습니다.',
          },
          { status: 403, headers }
        )
      }
    }

    const rawPw = String(d.pw || '').trim()
    let passwordValue: string
    if (rawPw) {
      passwordValue = isHashed(rawPw) ? rawPw : await hashPassword(rawPw)
    } else {
      passwordValue = ''
    }

    const nameNorm = normalizeEmployeeNameFields(
      String(d.name || '').trim(),
      String(d.nameTitle ?? d.name_title ?? '').trim()
    )
    const requiredStore = String(d.store || '').trim()
    const requiredJob = String(d.job || '').trim()
    if (!requiredStore || !nameNorm.name || !requiredJob) {
      return NextResponse.json(
        { success: false, code: 'VALIDATION_ERROR', message: '❌ 매장·이름·직무는 필수입니다.' },
        { status: 400, headers }
      )
    }
    const changeReason = String((d as { changeReason?: unknown }).changeReason ?? body.changeReason ?? '').trim()
    const codeRaw = normalizeEmployeeCodeInput((d as { employeeCode?: unknown }).employeeCode ?? d.employee_code)
    const payload: Record<string, unknown> = {
      store: requiredStore,
      name: nameNorm.name,
      name_title: nameNorm.nameTitle,
      nick: String(d.nick || '').trim(),
      phone: String(d.phone || '').trim(),
      job: String(d.job || '').trim(),
      birth: toDateStr(d.birth),
      nation: String(d.nation || '').trim(),
      join_date: toDateStr(d.join),
      resign_date: toDateStr(d.resign),
      sal_type: String(d.salType || 'Monthly').trim(),
      sal_amt: Number(d.salAmt) || 0,
      role: String(d.role || 'Staff').trim(),
      email: String(d.email || '').trim(),
      annual_leave_days: d.annualLeaveDays != null && d.annualLeaveDays !== '' ? Number(d.annualLeaveDays) : null,
      id_number: d.idNumber != null ? String(d.idNumber).trim() : '',
      id_card_photo: d.idCardPhoto != null && String(d.idCardPhoto).trim() ? String(d.idCardPhoto).trim() : null,
      tax_id: d.taxId != null ? String(d.taxId).trim() : '',
      sso_number: d.ssoNumber != null ? String(d.ssoNumber).trim() : '',
      sso_exempt: !!(d as { ssoExempt?: unknown }).ssoExempt,
      address: d.address != null ? String(d.address).trim() : '',
      bank_name: d.bankName != null ? String(d.bankName).trim() : '',
      account_number: d.accountNumber != null ? String(d.accountNumber).trim() : '',
      position_allowance: d.positionAllowance != null ? Number(d.positionAllowance) : 0,
      haz_allow: effectiveHazardAllowanceForJob(
        String(d.job || '').trim(),
        d.riskAllowance != null ? Number(d.riskAllowance) : 0
      ),
      attendance_allowance: (() => {
        const aa = (d as { attendanceAllowance?: unknown }).attendanceAllowance
        return aa == null || aa === '' ? 500 : Number(aa)
      })(),
      grade: d.grade != null ? String(d.grade).trim() : '',
      photo: d.photo != null ? String(d.photo).trim() : '',
    }
    const employmentStatus = normalizeEmploymentStatus((d as { employmentStatus?: unknown }).employmentStatus, payload.resign_date)
    payload.employment_status = employmentStatus
    {
      let officePayrollFlag = false
      if (canAssignEmployeeDirectorRole(actorRole)) {
        officePayrollFlag = !!(d as { canManageOfficePayroll?: unknown }).canManageOfficePayroll
      } else if (rowIdForRole > 0) {
        try {
          const prevRows = (await supabaseSelectFilter('employees', appendSaasTenantFilter(`id=eq.${rowIdForRole}`, tenantScope, 'employees'), {
            limit: 1,
            select: 'can_manage_office_payroll',
          })) as { can_manage_office_payroll?: unknown }[]
          officePayrollFlag = isEmployeeOfficePayrollManagerFlag(prevRows?.[0]?.can_manage_office_payroll)
        } catch (e) {
          const em = e instanceof Error ? e.message : String(e)
          if (!/can_manage_office_payroll|42703|column/i.test(em)) throw e
        }
      }
      payload.can_manage_office_payroll = officePayrollFlag
    }
    if (employmentStatus === 'resigned') {
      if (!payload.resign_date) payload.resign_date = bangkokTodayDateStr()
    }
    if (codeRaw) {
      if (!EMPLOYEE_CODE_RE.test(codeRaw)) {
        return NextResponse.json(
          { success: false, message: '❌ 직원 코드는 영문 2글자 + 숫자 3자리 형식(예: AB001)이어야 합니다.' },
          { headers }
        )
      }
      const manualPrefix = codeRaw.slice(0, 2)
      const targetStoreForCode = String(payload.store || '').trim()
      try {
        const allRows = (await supabaseSelectFilter('employees', appendSaasTenantFilter('id=gt.0', tenantScope, 'employees'), {
          select: 'store,employee_code',
          limit: 5000,
          order: 'id.asc',
        })) as { store?: string | null; employee_code?: string | null }[]
        const usedByOtherStore = (allRows || []).some((r) => {
          const p = normalizeEmployeeCodeInput(r.employee_code).slice(0, 2)
          if (p !== manualPrefix) return false
          const s = String(r.store || '').trim()
          return !!s && s.toLowerCase() !== targetStoreForCode.toLowerCase()
        })
        if (usedByOtherStore) {
          return NextResponse.json(
            { success: false, message: `❌ 접두어 ${manualPrefix}는 다른 매장에서 이미 사용 중입니다. 매장별로 고유한 2글자 접두어를 사용해 주세요.` },
            { headers }
          )
        }
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (!/employee_code|42703|column/i.test(em)) throw e
      }
      payload.employee_code = codeRaw
    }

    const rowId = Number(d.row)
    const inputPhoneNorm = normalizePhoneForMatch(d.phone)
    if (inputPhoneNorm) {
      try {
        const rows = (await supabaseSelectFilter('employees', appendSaasTenantFilter('id=gt.0', tenantScope, 'employees'), {
          select: 'id,phone,deleted_at,employment_status,resign_date',
          limit: 5000,
          order: 'id.asc',
        })) as {
          id?: number
          phone?: string | null
          deleted_at?: string | null
          employment_status?: string | null
          resign_date?: string | null
        }[]
        const hasDup = (rows || []).some((r) => {
          const rid = Number(r.id || 0)
          if (rowId > 0 && rid === rowId) return false
          if (String(r.deleted_at || '').trim()) return false
          const status = normalizeEmploymentStatus(r.employment_status, r.resign_date)
          if (status === 'resigned') return false
          return normalizePhoneForMatch(r.phone) === inputPhoneNorm
        })
        if (hasDup) {
          return NextResponse.json(
            { success: false, code: 'PHONE_DUPLICATE', message: '❌ 이미 사용 중인 전화번호입니다.' },
            { status: 409, headers }
          )
        }
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (!/deleted_at|employment_status|42703|column/i.test(em)) throw e
        const rows = (await supabaseSelectFilter('employees', appendSaasTenantFilter('id=gt.0', tenantScope, 'employees'), {
          select: 'id,phone,resign_date',
          limit: 5000,
          order: 'id.asc',
        })) as { id?: number; phone?: string | null; resign_date?: string | null }[]
        const hasDupFallback = (rows || []).some((r) => {
          const rid = Number(r.id || 0)
          if (rowId > 0 && rid === rowId) return false
          if (String(r.resign_date || '').trim()) return false
          return normalizePhoneForMatch(r.phone) === inputPhoneNorm
        })
        if (hasDupFallback) {
          return NextResponse.json(
            { success: false, code: 'PHONE_DUPLICATE', message: '❌ 이미 사용 중인 전화번호입니다.' },
            { status: 409, headers }
          )
        }
      }
    }

    const multiSettings = await getFranchiseeMultiStoreSettings()
    const roleStr = String(d.role || '').trim()
    const franchiseeRow = rowRoleLooksFranchisee(roleStr)
    if (isTop) {
      if (franchiseeRow && multiSettings.enabled) {
        const primary = String(d.store || '').trim()
        const fromTop = (body as { extraStores?: unknown }).extraStores
        const fromD = (d as { extraStores?: unknown }).extraStores
        const rawExtra = Array.isArray(fromTop)
          ? (fromTop as unknown[])
          : Array.isArray(fromD)
            ? (fromD as unknown[])
            : []
        payload.extra_stores = normalizeFranchiseeExtraStores(primary, rawExtra, multiSettings.maxStores)
      } else {
        payload.extra_stores = []
      }
    }

    const newStore = String(d.store || '').trim()
    const newName = String(d.name || '').trim()
    const userName = String(auth.name || body.userName || body.user_name || '').trim()
    const auditActor = actorFromJwt(auth, userName)

    if (rowId === 0) {
      const staffLimit = await assertSaasStaffRegistrationAllowed({
        tenantId: tenantScope.tenantId,
        addingCount: 1,
      })
      if (!staffLimit.ok) {
        return NextResponse.json(
          { success: false, code: staffLimit.code, message: staffLimit.message },
          { status: 403, headers }
        )
      }
      if (roleCountsAsManagerSeat(requestedRole)) {
        const mgrLimit = await assertSaasManagerRegistrationAllowed({
          tenantId: tenantScope.tenantId,
          addingManagerSeats: 1,
        })
        if (!mgrLimit.ok) {
          return NextResponse.json(
            { success: false, code: mgrLimit.code, message: mgrLimit.message },
            { status: 403, headers }
          )
        }
      }
      preserveOfficeEmployeePayrollOnSave(payload, payrollAuth, newStore, null)
      payload.password = passwordValue || ''
      if (!codeRaw) {
        payload.employee_code = await buildNextEmployeeCodeForStore(newStore, tenantScope)
      }
      let toInsert: Record<string, unknown> = stampSaasTenantId({ ...payload }, tenantScope, 'employees')
      let insertedRow: Record<string, unknown> | null = null
      for (;;) {
        try {
          const inserted = (await supabaseInsert('employees', toInsert)) as Record<string, unknown>[] | null
          insertedRow = inserted?.[0] ?? null
          break
        } catch (insErr) {
          const em = insErr instanceof Error ? insErr.message : String(insErr)
          if (/attendance_allowance|42703|column/i.test(em) && 'attendance_allowance' in toInsert) {
            const { attendance_allowance: _aa, ...rest } = toInsert
            toInsert = rest
            continue
          }
          if (/employee_code|42703|column/i.test(em) && 'employee_code' in toInsert) {
            const { employee_code: _ec, ...rest } = toInsert
            toInsert = rest
            continue
          }
          if (/employment_status|42703|column/i.test(em) && 'employment_status' in toInsert) {
            const { employment_status: _es, ...rest } = toInsert
            toInsert = rest
            continue
          }
          if (/extra_stores|42703|column/i.test(em) && 'extra_stores' in toInsert) {
            const { extra_stores: _xs, ...rest } = toInsert
            toInsert = rest
            continue
          }
          if (/employee_code/i.test(em) && /(duplicate key|23505)/i.test(em)) {
            if (codeRaw) {
              return NextResponse.json(
                { success: false, code: 'EMPLOYEE_CODE_DUPLICATE', message: '❌ 이미 사용 중인 직원 코드입니다.' },
                { status: 409, headers }
              )
            }
            toInsert = { ...toInsert, employee_code: await buildNextEmployeeCodeForStore(newStore, tenantScope) }
            continue
          }
          throw insErr
        }
      }
      let resolvedInsertId = Number(insertedRow?.id ?? 0) || null
      const insertedCode = String(
        insertedRow?.employee_code ?? payload.employee_code ?? ''
      ).trim()
      if (!resolvedInsertId && insertedCode) {
        try {
          const idRows = (await supabaseSelectFilter(
            'employees',
            appendSaasTenantFilter(`employee_code=eq.${encodeURIComponent(insertedCode)}&store=eq.${encodeURIComponent(newStore)}`, tenantScope, 'employees'),
            { limit: 1, select: 'id', order: 'id.desc' }
          ).catch(() => [])) as { id?: number }[]
          resolvedInsertId = Number(idRows?.[0]?.id ?? 0) || null
        } catch {
          // id 조회 실패해도 이력은 payload 스냅샷으로 남김
        }
      }
      const afterSnapshot =
        sanitizeEmployeeAuditRow(insertedRow) ||
        (resolvedInsertId ? sanitizeEmployeeAuditRow(await fetchEmployeeAuditSnapshot(resolvedInsertId)) : null) ||
        sanitizeEmployeeAuditRow({ ...payload, id: resolvedInsertId, employee_code: insertedCode || payload.employee_code })
      await writeEmployeeAudit({
        actionType: 'insert',
        employeeId: resolvedInsertId,
        employeeCode: insertedCode || null,
        employeeName: newName || null,
        employeeStore: newStore || null,
        beforeRow: null,
        afterRow: afterSnapshot,
        changeReason: changeReason || null,
        actor: auditActor,
      })
      return NextResponse.json({ success: true, message: '✅ 신규 직원이 등록되었습니다.' }, { headers })
    }

    // 직원 수정 시: 기존 데이터 조회 (급여 변경 이력·attendance 갱신·입력 이력용)
    const existingFull = await fetchEmployeeAuditSnapshot(rowId)

    // 직원 수정 시: 기존 데이터 조회 (급여 변경 이력·attendance 갱신용)
    let existing: {
      store?: string
      name?: string
      sal_type?: string
      sal_amt?: number
      position_allowance?: number
      haz_allow?: number
      employee_code?: string | null
      job?: string | null
      role?: string | null
      phone?: string | null
      resign_date?: string | null
      employment_status?: string | null
    }[] = []
    try {
      existing = (await supabaseSelectFilter('employees', appendSaasTenantFilter(`id=eq.${rowId}`, tenantScope, 'employees'), {
        limit: 1,
        select:
          'store,name,sal_type,sal_amt,position_allowance,haz_allow,employee_code,job,role,phone,resign_date,employment_status',
      })) as typeof existing
    } catch (e) {
      const em = e instanceof Error ? e.message : String(e)
      if (!/employment_status|42703|column/i.test(em)) throw e
    }
    if (!existing || existing.length === 0) {
      existing = (await supabaseSelectFilter('employees', appendSaasTenantFilter(`id=eq.${rowId}`, tenantScope, 'employees'), {
        limit: 1,
        select: 'store,name,sal_type,sal_amt,position_allowance,haz_allow,employee_code,job,role,phone,resign_date',
      })) as {
        store?: string
        name?: string
        sal_type?: string
        sal_amt?: number
        position_allowance?: number
        haz_allow?: number
        employee_code?: string | null
        job?: string | null
        role?: string | null
        phone?: string | null
        resign_date?: string | null
      }[]
    }
    const old = existing?.[0]
    if (!old) {
      return NextResponse.json(
        { success: false, message: '❌ 해당 직원을 찾을 수 없습니다.' },
        { status: 404, headers }
      )
    }
    const oldRoleForLimit = String(old.role || '').trim()
    if (
      roleCountsAsManagerSeat(requestedRole) &&
      !roleCountsAsManagerSeat(oldRoleForLimit)
    ) {
      const mgrLimit = await assertSaasManagerRegistrationAllowed({
        tenantId: tenantScope.tenantId,
        addingManagerSeats: 1,
      })
      if (!mgrLimit.ok) {
        return NextResponse.json(
          { success: false, code: mgrLimit.code, message: mgrLimit.message },
          { status: 403, headers }
        )
      }
    }
    preserveOfficeEmployeePayrollOnSave(payload, payrollAuth, newStore, old)
    const oldStore = old ? String(old.store || '').trim() : ''
    const oldName = old ? String(old.name || '').trim() : ''
    const oldCode = old ? String(old.employee_code || '').trim() : ''
    const nameOrStoreChanged = (oldName !== newName || oldStore !== newStore) && (oldName || oldStore)

    const oldSalType = old ? String(old.sal_type || '').trim() : ''
    const oldSalAmt = old ? Number(old.sal_amt) || 0 : 0
    const oldPosAllow = old ? Number(old.position_allowance) || 0 : 0
    const oldHazAllow = old ? Number(old.haz_allow) || 0 : 0
    const oldJob = old ? String(old.job || '').trim() : ''
    const oldRole = old ? String(old.role || '').trim() : ''
    const oldPhone = old ? String(old.phone || '').trim() : ''
    const oldResignDate = old ? toDateStr(old.resign_date) || '' : ''
    const oldEmploymentStatus = normalizeEmploymentStatus(old?.employment_status, old?.resign_date)
    const newSalType = String(payload.sal_type || 'Monthly').trim()
    const newSalAmt = Number(payload.sal_amt) || 0
    const newPosAllow = payload.position_allowance != null ? Number(payload.position_allowance) : 0
    const newHazAllow = Number(payload.haz_allow) || 0
    const newJob = String(payload.job || '').trim()
    const newRole = String(payload.role || '').trim()
    const newPhone = String(payload.phone || '').trim()
    const newResignDate = toDateStr(payload.resign_date) || ''
    const newEmploymentStatus = normalizeEmploymentStatus(payload.employment_status, payload.resign_date)
    const salaryChanged =
      oldSalType !== newSalType ||
      oldSalAmt !== newSalAmt ||
      oldPosAllow !== newPosAllow ||
      oldHazAllow !== newHazAllow

    if (passwordValue) payload.password = passwordValue
    try {
      await supabaseUpdateByFilter('employees', appendSaasTenantFilter(`id=eq.${rowId}`, tenantScope, 'employees'), stampSaasTenantId(payload, tenantScope, 'employees'))
    } catch (updErr) {
      const em = updErr instanceof Error ? updErr.message : String(updErr)
      if (/attendance_allowance|42703|column/i.test(em)) {
        const { attendance_allowance: _aa, ...withoutAa } = payload
        await supabaseUpdateByFilter('employees', appendSaasTenantFilter(`id=eq.${rowId}`, tenantScope, 'employees'), stampSaasTenantId(withoutAa, tenantScope, 'employees'))
      } else if (/employment_status|42703|column/i.test(em)) {
        const { employment_status: _es, ...withoutStatus } = payload
        await supabaseUpdateByFilter('employees', appendSaasTenantFilter(`id=eq.${rowId}`, tenantScope, 'employees'), stampSaasTenantId(withoutStatus, tenantScope, 'employees'))
      } else if (/employee_code/i.test(em) && /(duplicate key|23505)/i.test(em)) {
        return NextResponse.json(
          { success: false, code: 'EMPLOYEE_CODE_DUPLICATE', message: '❌ 이미 사용 중인 직원 코드입니다.' },
          { status: 409, headers }
        )
      } else {
        throw updErr
      }
    }

    if (salaryChanged) {
      try {
        await supabaseInsert('employee_salary_history', {
          employee_id: rowId,
          store: newStore,
          name: newName,
          old_sal_type: oldSalType || null,
          new_sal_type: newSalType,
          old_sal_amt: oldSalAmt,
          new_sal_amt: newSalAmt,
          old_position_allowance: oldPosAllow,
          new_position_allowance: newPosAllow,
          old_haz_allow: oldHazAllow,
          new_haz_allow: newHazAllow,
          changed_by: userName,
        })
      } catch (_) {
        // 이력 저장 실패해도 직원 저장은 완료됨
      }
    }

    const syncCodeNorm = normalizeEmployeeCodeForMatch(
      String(
        payload.employee_code != null && String(payload.employee_code).trim()
          ? (payload.employee_code as string)
          : codeRaw || oldCode
      )
    )
    const syncAttPatch: Record<string, unknown> = {
      store_name: String(payload.store || '').trim(),
      name: String(payload.name || '').trim(),
    }
    if (syncCodeNorm) syncAttPatch.employee_code = syncCodeNorm

    const patchAttendanceLogs = async (filter: string, patch: Record<string, unknown>) => {
      try {
        await supabaseUpdateByFilter('attendance_logs', filter, patch)
      } catch (e) {
        const em = e instanceof Error ? e.message : String(e)
        if (/employee_code|42703|column/i.test(em) && 'employee_code' in patch) {
          const rest = { ...patch }
          delete rest.employee_code
          await supabaseUpdateByFilter('attendance_logs', filter, rest)
        }
      }
    }

    try {
      await patchAttendanceLogs(`employee_id=eq.${rowId}`, syncAttPatch)
    } catch (_) {
      // attendance_logs 동기화 실패해도 직원 저장은 완료됨
    }

    if (nameOrStoreChanged) {
      try {
        const attFilter = `store_name=ilike.${encodeURIComponent(oldStore)}&name=ilike.${encodeURIComponent(oldName)}&employee_id=is.null`
        await patchAttendanceLogs(attFilter, syncAttPatch)
      } catch (_) {
        // 레거시(NULL id) 행 갱신 실패는 무시
      }
    }

    const changeEntries: { field: string; oldValue: string; newValue: string }[] = []
    const pushIfChanged = (field: string, oldValue: unknown, newValue: unknown) => {
      const oldStr = String(oldValue ?? '').trim()
      const newStr = String(newValue ?? '').trim()
      if (oldStr === newStr) return
      changeEntries.push({ field, oldValue: oldStr, newValue: newStr })
    }
    pushIfChanged('store', oldStore, newStore)
    pushIfChanged('name', oldName, newName)
    pushIfChanged('job', oldJob, newJob)
    pushIfChanged('role', oldRole, newRole)
    pushIfChanged('phone', oldPhone, newPhone)
    pushIfChanged('employee_code', oldCode, String(payload.employee_code || oldCode || ''))
    pushIfChanged('sal_type', oldSalType, newSalType)
    pushIfChanged('sal_amt', oldSalAmt, newSalAmt)
    pushIfChanged('position_allowance', oldPosAllow, newPosAllow)
    pushIfChanged('haz_allow', oldHazAllow, newHazAllow)
    pushIfChanged('resign_date', oldResignDate, newResignDate)
    pushIfChanged('employment_status', oldEmploymentStatus, newEmploymentStatus)

    if (changeEntries.length > 0) {
      for (const c of changeEntries) {
        try {
          await supabaseInsert('employee_change_logs', {
            employee_id: rowId,
            field_name: c.field,
            old_value: c.oldValue || null,
            new_value: c.newValue || null,
            changed_by: userName || null,
            change_reason: changeReason || null,
          })
        } catch {
          // 이력 저장 실패해도 직원 저장은 완료됨
        }
      }
    }

    const afterFull = await fetchEmployeeAuditSnapshot(rowId)

    await writeEmployeeAudit({
      actionType: 'update',
      employeeId: rowId,
      employeeCode: String(afterFull?.employee_code ?? payload.employee_code ?? oldCode ?? '').trim() || null,
      employeeName: newName || null,
      employeeStore: newStore || null,
      beforeRow: existingFull,
      afterRow: afterFull,
      changeReason: changeReason || null,
      actor: auditActor,
    })

    return NextResponse.json({ success: true, message: '✅ 직원 정보가 수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveAdminEmployee:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
