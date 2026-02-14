import { NextRequest, NextResponse } from 'next/server'
import { supabaseUpsert } from '@/lib/supabase-server'

const CHUNK = 50

export interface PayrollSaveRow {
  store: string
  name: string
  dept?: string
  role?: string
  salary?: number
  posAllow?: number
  hazAllow?: number
  birthBonus?: number
  holidayPay?: number
  splBonus?: number
  ot15?: number
  ot20?: number
  ot30?: number
  otAmt?: number
  lateMin?: number
  lateDed?: number
  sso?: number
  tax?: number
  otherDed?: number
  netPay?: number
  status?: string
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const monthStr = String(body.month || body.monthStr || '').trim().slice(0, 7)
    const list = (body.list || body.rows || []) as PayrollSaveRow[]

    if (!monthStr || monthStr.length < 7) {
      return NextResponse.json(
        { success: false, msg: '귀속월을 선택해주세요.' },
        { status: 400, headers }
      )
    }

    if (!Array.isArray(list) || list.length === 0) {
      return NextResponse.json(
        { success: false, msg: '저장할 데이터가 없습니다.' },
        { status: 400, headers }
      )
    }

    const rows: Record<string, unknown>[] = list.map((r) => ({
      month: monthStr,
      store: String(r.store || '').trim(),
      name: String(r.name || '').trim(),
      dept: String(r.dept || '').trim(),
      role: String(r.role || '').trim(),
      salary: Number(r.salary) || 0,
      pos_allow: Number(r.posAllow) || 0,
      haz_allow: Number(r.hazAllow) || 0,
      birth_bonus: Number(r.birthBonus) || 0,
      holiday_pay: Number(r.holidayPay) ?? 0,
      spl_bonus: Number(r.splBonus) || 0,
      ot_15: Number(r.ot15) || 0,
      ot_20: Number(r.ot20) || 0,
      ot_30: Number(r.ot30) || 0,
      ot_amt: Number(r.otAmt) || 0,
      late_min: Number(r.lateMin) || 0,
      late_ded: Number(r.lateDed) || 0,
      sso: Number(r.sso) || 0,
      tax: Number(r.tax) || 0,
      other_ded: Number(r.otherDed) || 0,
      net_pay: Number(r.netPay) || 0,
      status: String(r.status || '확정').trim(),
    }))

    for (let j = 0; j < rows.length; j += CHUNK) {
      const chunk = rows.slice(j, j + CHUNK)
      await supabaseUpsert('payroll_records', chunk, 'month,store,name')
    }

    return NextResponse.json(
      { success: true, msg: `${monthStr} 급여 내역이 DB에 저장되었습니다.` },
      { headers }
    )
  } catch (e) {
    console.error('savePayroll:', e)
    return NextResponse.json(
      { success: false, msg: '저장 실패: ' + (e instanceof Error ? e.message : String(e)) },
      { status: 500, headers }
    )
  }
}
