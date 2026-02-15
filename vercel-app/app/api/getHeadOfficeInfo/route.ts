import { NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 본사 정보 조회 (인보이스/설정용) */
export async function GET() {
  try {
    let rows = (await supabaseSelectFilter('vendors', 'type=eq.본사', { limit: 1 })) as {
      id?: number
      name?: string
      addr?: string
      tax_id?: string
      phone?: string
      memo?: string
    }[]
    if (!rows || rows.length === 0) {
      rows = (await supabaseSelectFilter('vendors', 'type=eq.Head Office', { limit: 1 })) as typeof rows
    }
    const r = rows?.[0]
    return NextResponse.json({
      companyName: r ? String(r.name || '').trim() : '',
      taxId: r ? String(r.tax_id || '').trim() : '',
      address: r ? String(r.addr || '').trim() : '',
      phone: r ? String(r.phone || '').trim() : '',
      bankInfo: r ? String(r.memo || '').trim() : '',
    })
  } catch (e) {
    console.error('getHeadOfficeInfo:', e)
    return NextResponse.json(
      { companyName: '', taxId: '', address: '', phone: '', bankInfo: '' },
      { status: 500 }
    )
  }
}
