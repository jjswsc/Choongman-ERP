import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 매장별 회사명 조회 (vendors gps_name 또는 name 일치, 없으면 본사) */
async function getStoreCompanyName(store: string): Promise<string> {
  const storeTrim = String(store || '').trim()
  if (!storeTrim) return ''
  try {
    let rows = (await supabaseSelectFilter('vendors', `gps_name=eq.${encodeURIComponent(storeTrim)}`, { limit: 1 })) as { name?: string }[]
    if (rows?.length && rows[0]?.name) return String(rows[0].name).trim()
    rows = (await supabaseSelectFilter('vendors', `name=eq.${encodeURIComponent(storeTrim)}`, { limit: 1 })) as { name?: string }[]
    if (rows?.length && rows[0]?.name) return String(rows[0].name).trim()
    rows = (await supabaseSelectFilter('vendors', 'type=eq.본사', { limit: 1 })) as { name?: string }[]
    if (!rows?.length) rows = (await supabaseSelectFilter('vendors', 'type=eq.Head Office', { limit: 1 })) as { name?: string }[]
    return rows?.[0] ? String(rows[0].name || '').trim() : ''
  } catch {
    return ''
  }
}

/**
 * 본인 급여 명세서 조회 (store + name 일치)
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const monthStr = String(searchParams.get('month') || searchParams.get('monthStr') || '').trim().slice(0, 7)
  const userStore = String(searchParams.get('userStore') || searchParams.get('store') || '').trim()
  const userName = String(searchParams.get('userName') || searchParams.get('name') || '').trim()

  if (!monthStr || monthStr.length < 7) {
    return NextResponse.json(
      { success: false, data: null, msg: '조회할 월(yyyy-MM)을 선택해주세요.' },
      { status: 400, headers }
    )
  }
  if (!userStore || !userName) {
    return NextResponse.json(
      { success: false, data: null, msg: '로그인 정보가 필요합니다.' },
      { status: 400, headers }
    )
  }

  try {
    const filter = `month=eq.${encodeURIComponent(monthStr)}&store=eq.${encodeURIComponent(userStore)}&name=eq.${encodeURIComponent(userName)}`
    const rows = await supabaseSelectFilter('payroll_records', filter, {
      order: 'month.desc',
      limit: 1,
    })

    const r = Array.isArray(rows) && rows.length > 0 ? rows[0] : null
    if (!r) {
      return NextResponse.json({ success: true, data: null, msg: '' }, { headers })
    }

    const storeName = String(r.store || '').trim()
    const companyName = await getStoreCompanyName(storeName)

    const data = {
      month: String(r.month || ''),
      store: storeName,
      name: String(r.name || ''),
      dept: String(r.dept || ''),
      role: String(r.role || ''),
      companyName: companyName || undefined,
      salary: Number(r.salary) || 0,
      pos_allow: Number(r.pos_allow) || 0,
      haz_allow: Number(r.haz_allow) || 0,
      birth_bonus: Number(r.birth_bonus) || 0,
      holiday_pay: Number(r.holiday_pay) ?? 0,
      spl_bonus: Number(r.spl_bonus) || 0,
      ot_amt: Number(r.ot_amt) || 0,
      late_ded: Number(r.late_ded) || 0,
      sso: Number(r.sso) || 0,
      tax: Number(r.tax) || 0,
      other_ded: Number(r.other_ded) || 0,
      net_pay: Number(r.net_pay) || 0,
    }

    return NextResponse.json({ success: true, data }, { headers })
  } catch (e) {
    console.error('getMyPayroll:', e)
    return NextResponse.json(
      { success: false, data: null, msg: '급여 조회 중 오류가 발생했습니다.' },
      { status: 500, headers }
    )
  }
}
