import { NextResponse } from 'next/server'
import { resolveHeadOfficeFromVendorRow } from '@/lib/head-office-defaults'
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
    const resolved = resolveHeadOfficeFromVendorRow(rows?.[0])
    return NextResponse.json({
      companyName: resolved.companyName,
      taxId: resolved.taxId,
      address: resolved.address,
      phone: resolved.phone,
      bankInfo: resolved.bankInfo,
    })
  } catch (e) {
    console.error('getHeadOfficeInfo:', e)
    return NextResponse.json(
      { companyName: '', taxId: '', address: '', phone: '', bankInfo: '' },
      { status: 500 }
    )
  }
}
