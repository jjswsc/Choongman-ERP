import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelect, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { hashPassword, isHashed } from '@/lib/password'
import {
  isAccountingRole,
  isFranchiseeRole,
  isDirectorRole,
  isEmployeeAuthRoleOfficerOrDirector,
} from '@/lib/permissions'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'
import {
  franchiseeQueryStoreAllowed,
  getFranchiseeMultiStoreSettings,
  normalizedAllowedStoresFromJwt,
  rowRoleLooksFranchisee,
} from '@/lib/franchisee-multi-store'
import { normalizeEmployeeCodeForMatch, normalizeEmployeeNameFields } from '@/lib/employee-display-name'

const EMPLOYEE_CODE_RE = /^[A-Z]{2}\d{3}$/

function toDateStr(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') {
    const s = val.trim().slice(0, 10)
    return s || null
  }
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
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

async function buildNextEmployeeCodeForStore(storeName: string): Promise<string> {
  let rows: { store?: string | null; employee_code?: string | null }[] = []
  try {
    rows = (await supabaseSelect('employees', {
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
    const body = await req.json()
    const d = body.d || body
    const userStore = String(body.userStore || '').trim()
    const userRole = String(body.userRole || '').toLowerCase()
    const jwt = await tryVerifyBearerFromRequest(req)
    const effectiveRole = String(jwt?.role || userRole).toLowerCase()

    const isTop =
      ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r)) || isAccountingRole(userRole)
    const franchiseeJwtList =
      jwt && isFranchiseeRole(jwt.role || '') ? normalizedAllowedStoresFromJwt(jwt) : undefined

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
          allowedStores: franchiseeJwtList && franchiseeJwtList.length > 0 ? franchiseeJwtList : undefined,
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
    const normRole = (s: string) => String(s || '').trim().toLowerCase()
    if (!isDirectorRole(effectiveRole)) {
      if (rowIdForRole === 0) {
        if (isEmployeeAuthRoleOfficerOrDirector(requestedRole)) {
          return NextResponse.json(
            {
              success: false,
              message: '❌ Officer·Director 역할은 Director급만 지정할 수 있습니다.',
            },
            { status: 403, headers }
          )
        }
      } else {
        const prevRows = (await supabaseSelectFilter('employees', `id=eq.${rowIdForRole}`, {
          limit: 1,
          select: 'role',
        })) as { role?: string | null }[]
        const prevRole = prevRows?.[0]?.role != null ? String(prevRows[0].role) : ''
        if (
          isEmployeeAuthRoleOfficerOrDirector(requestedRole) &&
          normRole(requestedRole) !== normRole(prevRole)
        ) {
          return NextResponse.json(
            {
              success: false,
              message: '❌ Officer·Director 역할은 Director급만 변경·지정할 수 있습니다.',
            },
            { status: 403, headers }
          )
        }
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
    const codeRaw = normalizeEmployeeCodeInput((d as { employeeCode?: unknown }).employeeCode ?? d.employee_code)
    const payload: Record<string, unknown> = {
      store: String(d.store || '').trim(),
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
      haz_allow: d.riskAllowance != null ? Number(d.riskAllowance) : 0,
      attendance_allowance: (() => {
        const aa = (d as { attendanceAllowance?: unknown }).attendanceAllowance
        return aa == null || aa === '' ? 500 : Number(aa)
      })(),
      grade: d.grade != null ? String(d.grade).trim() : '',
      photo: d.photo != null ? String(d.photo).trim() : '',
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
        const allRows = (await supabaseSelect('employees', {
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
        const seen = new Set<string>()
        const extras: string[] = []
        const maxExtra = Math.max(0, multiSettings.maxStores - 1)
        for (const x of rawExtra) {
          const s = String(x || '').trim()
          if (!s || s === primary || seen.has(s)) continue
          seen.add(s)
          extras.push(s)
          if (extras.length >= maxExtra) break
        }
        payload.extra_stores = extras
      } else {
        payload.extra_stores = []
      }
    }

    const rowId = Number(d.row)
    const newStore = String(d.store || '').trim()
    const newName = String(d.name || '').trim()
    const userName = String(body.userName || body.user_name || '').trim()

    if (rowId === 0) {
      payload.password = passwordValue || ''
      if (!codeRaw) {
        payload.employee_code = await buildNextEmployeeCodeForStore(newStore)
      }
      let toInsert: Record<string, unknown> = { ...payload }
      for (;;) {
        try {
          await supabaseInsert('employees', toInsert)
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
          if (/employee_code/i.test(em) && /(duplicate key|23505)/i.test(em)) {
            if (codeRaw) {
              return NextResponse.json({ success: false, message: '❌ 이미 사용 중인 직원 코드입니다.' }, { headers })
            }
            toInsert = { ...toInsert, employee_code: await buildNextEmployeeCodeForStore(newStore) }
            continue
          }
          throw insErr
        }
      }
      return NextResponse.json({ success: true, message: '✅ 신규 직원이 등록되었습니다.' }, { headers })
    }

    // 직원 수정 시: 기존 데이터 조회 (급여 변경 이력·attendance 갱신용)
    const existing = (await supabaseSelectFilter('employees', `id=eq.${rowId}`, {
      limit: 1,
      select: 'store,name,sal_type,sal_amt,position_allowance,haz_allow,employee_code',
    })) as {
      store?: string
      name?: string
      sal_type?: string
      sal_amt?: number
      position_allowance?: number
      haz_allow?: number
      employee_code?: string | null
    }[]
    const old = existing?.[0]
    const oldStore = old ? String(old.store || '').trim() : ''
    const oldName = old ? String(old.name || '').trim() : ''
    const oldCode = old ? String(old.employee_code || '').trim() : ''
    const nameOrStoreChanged = (oldName !== newName || oldStore !== newStore) && (oldName || oldStore)

    const oldSalType = old ? String(old.sal_type || '').trim() : ''
    const oldSalAmt = old ? Number(old.sal_amt) || 0 : 0
    const oldPosAllow = old ? Number(old.position_allowance) || 0 : 0
    const oldHazAllow = old ? Number(old.haz_allow) || 0 : 0
    const newSalType = String(d.salType || 'Monthly').trim()
    const newSalAmt = Number(d.salAmt) || 0
    const newPosAllow = d.positionAllowance != null ? Number(d.positionAllowance) : 0
    const newHazAllow = d.riskAllowance != null ? Number(d.riskAllowance) : 0
    const salaryChanged =
      oldSalType !== newSalType ||
      oldSalAmt !== newSalAmt ||
      oldPosAllow !== newPosAllow ||
      oldHazAllow !== newHazAllow

    if (passwordValue) payload.password = passwordValue
    try {
      await supabaseUpdate('employees', rowId, payload)
    } catch (updErr) {
      const em = updErr instanceof Error ? updErr.message : String(updErr)
      if (/attendance_allowance|42703|column/i.test(em)) {
        const { attendance_allowance: _aa, ...withoutAa } = payload
        await supabaseUpdate('employees', rowId, withoutAa)
      } else if (/employee_code/i.test(em) && /(duplicate key|23505)/i.test(em)) {
        return NextResponse.json({ success: false, message: '❌ 이미 사용 중인 직원 코드입니다.' }, { headers })
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

    return NextResponse.json({ success: true, message: '✅ 직원 정보가 수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveAdminEmployee:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
