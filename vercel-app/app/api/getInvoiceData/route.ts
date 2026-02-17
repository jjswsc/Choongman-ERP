import { NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 인보이스 인쇄용: 본사 정보 + 매출처(회사명별) 정보 반환 (Supabase vendors) */
export async function GET() {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    // 본사 정보 (type=본사 또는 Head Office)
    let companyRows = (await supabaseSelectFilter('vendors', 'type=eq.본사', { limit: 1 })) as {
      name?: string
      addr?: string
      tax_id?: string
      phone?: string
      memo?: string
    }[] | null
    if (!companyRows || companyRows.length === 0) {
      companyRows = (await supabaseSelectFilter('vendors', 'type=eq.Head Office', { limit: 1 })) as typeof companyRows
    }
    const company = (companyRows && companyRows.length > 0)
      ? {
          companyName: String(companyRows[0].name || 'บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)').trim(),
          address: String(companyRows[0].addr || '').trim() || '-',
          taxId: String((companyRows[0] as { tax_id?: string }).tax_id || '0105566137147').trim(),
          phone: String(companyRows[0].phone || '091-072-6252').trim(),
          bankInfo: String(companyRows[0].memo || 'ธนาคารกสิกรไทย เลขที่ 166-2-97079-0 ชื่อบัญชี บจก. เอสแอนด์เจ โกลบอล').trim(),
          projectName: 'CM True Digital Park',
        }
      : {
          companyName: 'บริษัท เอสแอนด์เจ โกลบอล จำกัด (Head Office)',
          address: '-',
          taxId: '0105566137147',
          phone: '091-072-6252',
          bankInfo: 'ธนาคารกสิกรไทย เลขที่ 166-2-97079-0 ชื่อบัญชี บจก. เอสแอนด์เจ โกลบอล',
          projectName: 'CM True Digital Park',
        }

    // 매출처 (type=매출처 또는 Sales, both) - name(회사명)과 gps_name(매장명) 모두 키로 등록
    const clients: Record<string, { companyName: string; address: string; taxId: string; phone: string }> = {}
    let clientRows = (await supabaseSelectFilter('vendors', 'type=eq.매출처', { limit: 500 })) as {
      name?: string
      addr?: string
      tax_id?: string
      phone?: string
      gps_name?: string
    }[] | null
    if (!clientRows || clientRows.length === 0) {
      clientRows = (await supabaseSelectFilter('vendors', 'type=eq.sales', { limit: 500 })) as typeof clientRows
    }
    if (!clientRows || clientRows.length === 0) {
      clientRows = (await supabaseSelectFilter('vendors', 'type=eq.both', { limit: 500 })) as typeof clientRows
    }
    for (const r of clientRows || []) {
      const companyName = String(r.name || '').trim()
      const gpsName = String((r as { gps_name?: string }).gps_name || '').trim()
      if (!companyName && !gpsName) continue
      const entry = {
        companyName: companyName || gpsName,
        address: String(r.addr || '').trim() || '-',
        taxId: String((r as { tax_id?: string }).tax_id || '').trim() || '-',
        phone: String(r.phone || '').trim() || '-',
      }
      const keysToAdd = [companyName, gpsName].filter(Boolean)
      const seen = new Set<string>()
      for (const k of keysToAdd) {
        if (!k || seen.has(k)) continue
        seen.add(k)
        clients[k] = entry
        const normalized = k.toLowerCase().trim()
        if (normalized && normalized !== k) clients[normalized] = entry
      }
    }

    return NextResponse.json({ company, clients }, { headers })
  } catch (e) {
    console.error('getInvoiceData:', e)
    return NextResponse.json(
      { company: null, clients: {} },
      { status: 500, headers }
    )
  }
}
