import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert, supabaseUpdateByFilter } from '@/lib/supabase-server'
import { clearDirectSettlementCache } from '@/lib/direct-settlement-server'

function mapTypeToDb(type: string): string {
  const t = String(type || '').toLowerCase()
  if (t === 'sales') return 'sales'
  if (t === 'both') return 'both'
  return 'purchase'
}

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      code?: string
      name?: string
      gps_name?: string
      sales_outlet?: string
      contact?: string
      phone?: string
      email?: string
      address?: string
      tax_no?: string
      type?: string
      memo?: string
      editingCode?: string
      direct_settlement?: boolean
    }

    const code = String(body.code || '').trim()
    const name = String(body.name || '').trim()
    const gpsName = String(body.gps_name || '').trim()
    const salesOutlet = String(body.sales_outlet || '').trim() || null
    const editingCode = body.editingCode ? String(body.editingCode).trim() : null
    if (!code || !name) {
      return NextResponse.json({ success: false, message: '코드와 거래처명이 필요합니다.' }, { headers })
    }

    const row = {
      code,
      name,
      gps_name: gpsName || null,
      sales_outlet: salesOutlet,
      type: mapTypeToDb(body.type || 'purchase'),
      manager: String(body.contact || '').trim(),
      phone: String(body.phone || '').trim(),
      addr: String(body.address || '').trim(),
      tax_id: String(body.tax_no || '').trim() || null,
      memo: String(body.memo || '').trim(),
      direct_settlement: Boolean(body.direct_settlement),
    }

    const filterCode = editingCode || code
    const isHqVendor = filterCode.toUpperCase() === 'HQ'
    // 본사 행(saveHeadOfficeInfo): type=본사 유지. 거래처 폼 저장만 하면 mapTypeToDb가 purchase로 덮어 출퇴근 본사 GPS 폴백이 깨짐.
    const rowForDb = isHqVendor ? { ...row, type: '본사' } : row

    const existing = (await supabaseSelectFilter(
      'vendors',
      `code=eq.${encodeURIComponent(filterCode)}`
    )) as { id?: number }[] | null

    if (existing && existing.length > 0) {
      await supabaseUpdateByFilter('vendors', `code=eq.${encodeURIComponent(filterCode)}`, rowForDb)
      clearDirectSettlementCache()
      return NextResponse.json({ success: true, message: '수정되었습니다.' }, { headers })
    }

    await supabaseInsert('vendors', rowForDb)
    clearDirectSettlementCache()
    return NextResponse.json({ success: true, message: '저장되었습니다.' }, { headers })
  } catch (e) {
    console.error('saveVendor:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : '저장 실패' },
      { headers }
    )
  }
}
