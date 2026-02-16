import { NextResponse } from 'next/server'
import { supabaseInsert, supabaseUpdate } from '@/lib/supabase-server'
import { hashPassword, isHashed } from '@/lib/password'


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

    const isTop = ['director', 'officer', 'ceo', 'hr'].some((r) => userRole.includes(r))
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
      annual_leave_days: d.annualLeaveDays != null && d.annualLeaveDays !== '' ? Number(d.annualLeaveDays) : 0,
      bank_name: d.bankName != null ? String(d.bankName).trim() : '',
      account_number: d.accountNumber != null ? String(d.accountNumber).trim() : '',
      position_allowance: d.positionAllowance != null ? Number(d.positionAllowance) : 0,
      haz_allow: d.riskAllowance != null ? Number(d.riskAllowance) : 0,
      grade: d.grade != null ? String(d.grade).trim() : '',
      photo: d.photo != null ? String(d.photo).trim() : '',
    }

    const rowId = Number(d.row)
    if (rowId === 0) {
      payload.password = passwordValue || ''
      await supabaseInsert('employees', payload)
      return NextResponse.json({ success: true, message: '✅ 신규 직원이 등록되었습니다.' }, { headers })
    }
    if (passwordValue) payload.password = passwordValue
    await supabaseUpdate('employees', rowId, payload)
    return NextResponse.json({ success: true, message: '✅ 직원 정보가 수정되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveAdminEmployee:', e)
    return NextResponse.json(
      { success: false, message: '❌ 오류: ' + (e instanceof Error ? e.message : String(e)) },
      { headers }
    )
  }
}
