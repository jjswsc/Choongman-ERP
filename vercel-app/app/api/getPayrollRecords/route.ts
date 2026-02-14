import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export interface PayrollRecordRow {
  month: string
  store: string
  name: string
  dept: string
  role: string
  salary: number
  pos_allow: number
  haz_allow: number
  birth_bonus: number
  holiday_pay: number
  spl_bonus: number
  ot_15: number
  ot_20: number
  ot_30: number
  ot_amt: number
  late_min: number
  late_ded: number
  sso: number
  tax: number
  other_ded: number
  net_pay: number
  status: string
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const monthStr = String(searchParams.get('month') || searchParams.get('monthStr') || '').trim().slice(0, 7)
  const storeFilter = String(searchParams.get('storeFilter') || searchParams.get('store') || '').trim()

  if (!monthStr || monthStr.length < 7) {
    return NextResponse.json(
      { success: false, list: [], msg: '조회할 월(yyyy-MM)을 선택해주세요.' },
      { status: 400, headers }
    )
  }

  try {
    const isAll = !storeFilter || storeFilter === 'All' || storeFilter === '전체'
    const filter = isAll
      ? `month=eq.${encodeURIComponent(monthStr)}`
      : `month=eq.${encodeURIComponent(monthStr)}&store=eq.${encodeURIComponent(storeFilter)}`

    const rows = await supabaseSelectFilter('payroll_records', filter, {
      order: 'store.asc,name.asc',
      limit: 1000,
    })

    const list = (rows || []).map((r: Record<string, unknown>) => ({
      month: String(r.month || ''),
      store: String(r.store || ''),
      name: String(r.name || ''),
      dept: String(r.dept || ''),
      role: String(r.role || ''),
      salary: Number(r.salary) || 0,
      pos_allow: Number(r.pos_allow) || 0,
      haz_allow: Number(r.haz_allow) || 0,
      birth_bonus: Number(r.birth_bonus) || 0,
      holiday_pay: Number(r.holiday_pay) ?? 0,
      spl_bonus: Number(r.spl_bonus) || 0,
      ot_15: Number(r.ot_15) || 0,
      ot_20: Number(r.ot_20) || 0,
      ot_30: Number(r.ot_30) || 0,
      ot_amt: Number(r.ot_amt) || 0,
      late_min: Number(r.late_min) || 0,
      late_ded: Number(r.late_ded) || 0,
      sso: Number(r.sso) || 0,
      tax: Number(r.tax) || 0,
      other_ded: Number(r.other_ded) || 0,
      net_pay: Number(r.net_pay) || 0,
      status: String(r.status || ''),
    }))

    return NextResponse.json({ success: true, list }, { headers })
  } catch (e) {
    console.error('getPayrollRecords:', e)
    return NextResponse.json(
      { success: false, list: [], msg: '급여 내역 조회 중 오류가 발생했습니다.' },
      { status: 500, headers }
    )
  }
}
