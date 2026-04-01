import { NextRequest, NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { hashPassword, isHashed } from '@/lib/password'
import { isAccountingRole, isFranchiseeRole } from '@/lib/permissions'
import { tryVerifyBearerFromRequest } from '@/lib/verify-auth'
import { userCanAccessEmployeeStore } from '@/lib/admin-employee-store-access'
import {
  franchiseeQueryStoreAllowed,
  getFranchiseeMultiStoreSettings,
  normalizedAllowedStoresFromJwt,
  rowRoleLooksFranchisee,
} from '@/lib/franchisee-multi-store'

function toDateStr(val: unknown): string | null {
  if (!val) return null
  if (typeof val === 'string') {
    const s = val.trim().slice(0, 10)
    return s || null
  }
  const d = new Date(val as string)
  return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
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

    const rawPw = String(d.pw || '').trim()
    let passwordValue: string
    if (rawPw) {
      passwordValue = isHashed(rawPw) ? rawPw : await hashPassword(rawPw)
    } else {
      passwordValue = ''
    }

    const payload: Record<string, unknown> = {
      store: String(d.store || '').trim(),
      name: String(d.name || '').trim(),
      name_title: String(d.nameTitle ?? d.name_title ?? '').trim(),
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
      try {
        await supabaseInsert('employees', payload)
      } catch (insErr) {
        const em = insErr instanceof Error ? insErr.message : String(insErr)
        if (/attendance_allowance|42703|column/i.test(em)) {
          const { attendance_allowance: _aa, ...withoutAa } = payload
          await supabaseInsert('employees', withoutAa)
        } else {
          throw insErr
        }
      }
      return NextResponse.json({ success: true, message: '✅ 신규 직원이 등록되었습니다.' }, { headers })
    }

    // 직원 수정 시: 기존 데이터 조회 (급여 변경 이력·attendance 갱신용)
    const existing = (await supabaseSelectFilter('employees', `id=eq.${rowId}`, {
      limit: 1,
      select: 'store,name,sal_type,sal_amt,position_allowance,haz_allow',
    })) as {
      store?: string
      name?: string
      sal_type?: string
      sal_amt?: number
      position_allowance?: number
      haz_allow?: number
    }[]
    const old = existing?.[0]
    const oldStore = old ? String(old.store || '').trim() : ''
    const oldName = old ? String(old.name || '').trim() : ''
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

    if (nameOrStoreChanged) {
      try {
        const attFilter = `store_name=ilike.${encodeURIComponent(oldStore)}&name=ilike.${encodeURIComponent(oldName)}`
        await supabaseUpdateByFilter('attendance_logs', attFilter, {
          store_name: newStore,
          name: newName,
        })
      } catch (_) {
        // attendance_logs 업데이트 실패해도 직원 저장은 완료됨
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
