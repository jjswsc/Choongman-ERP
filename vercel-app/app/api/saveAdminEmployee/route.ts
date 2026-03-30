import { NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate, supabaseSelectFilter, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { hashPassword, isHashed } from '@/lib/password'
import { isAccountingRole } from '@/lib/permissions'

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
export async function POST(req: Request) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await req.json()
    const d = body.d || body
    const userStore = String(body.userStore || '').trim()
    const userRole = String(body.userRole || '').toLowerCase()

    const isTop = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r)) || isAccountingRole(userRole)
    if (!isTop && userStore && String(d.store || '').trim() !== userStore) {
      return NextResponse.json(
        { success: false, message: '❌ 해당 매장 직원만 수정할 수 있습니다.' },
        { headers }
      )
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
      address: d.address != null ? String(d.address).trim() : '',
      bank_name: d.bankName != null ? String(d.bankName).trim() : '',
      account_number: d.accountNumber != null ? String(d.accountNumber).trim() : '',
      position_allowance: d.positionAllowance != null ? Number(d.positionAllowance) : 0,
      haz_allow: d.riskAllowance != null ? Number(d.riskAllowance) : 0,
      grade: d.grade != null ? String(d.grade).trim() : '',
      photo: d.photo != null ? String(d.photo).trim() : '',
    }

    const rowId = Number(d.row)
    const newStore = String(d.store || '').trim()
    const newName = String(d.name || '').trim()
    const userName = String(body.userName || body.user_name || '').trim()

    if (rowId === 0) {
      payload.password = passwordValue || ''
      await supabaseInsert('employees', payload)
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
    await supabaseUpdate('employees', rowId, payload)

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
