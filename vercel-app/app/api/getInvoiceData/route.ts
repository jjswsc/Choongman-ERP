import { NextResponse } from 'next/server'
import { resolveHeadOfficeFromVendorRow } from '@/lib/head-office-defaults'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { fetchSalesTypesVendorsForInvoice } from '@/lib/invoice-vendor-clients'

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
    const company = resolveHeadOfficeFromVendorRow(
      companyRows && companyRows.length > 0 ? companyRows[0] : null
    )

    // 매출처 (type=매출처 또는 Sales, both) - name(회사명)과 gps_name(매장명) 모두 키로 등록
    const clients: Record<string, { companyName: string; address: string; taxId: string; phone: string }> = {}
    // 본사(Office/본사 등)도 clients에 추가 - target이 Office일 때 매칭되도록
    if (company) {
      const officeEntry = {
        companyName: company.companyName,
        address: company.address || '-',
        taxId: company.taxId || '-',
        phone: company.phone || '-',
      }
      const officeKeys = ['Office', '본사', '오피스', '본점', 'Head Office']
      for (const k of officeKeys) {
        clients[k] = officeEntry
        clients[k.toLowerCase()] = officeEntry
      }
    }
    const clientRows = await fetchSalesTypesVendorsForInvoice()
    for (const r of clientRows) {
      const companyName = String(r.name || '').trim()
      const gpsName = String((r as { gps_name?: string }).gps_name || '').trim()
      const salesOutlet = String((r as { sales_outlet?: string }).sales_outlet || '').trim()
      const displayName = salesOutlet || gpsName || companyName
      if (!companyName && !gpsName && !salesOutlet) continue
      const entry = {
        companyName: companyName || displayName,
        address: String(r.addr || '').trim() || '-',
        taxId: String((r as { tax_id?: string }).tax_id || '').trim() || '-',
        phone: String(r.phone || '').trim() || '-',
      }
      const keysToAdd = [companyName, gpsName, salesOutlet].filter(Boolean)
      if (gpsName && gpsName.match(/^CM\s+/i)) keysToAdd.push(gpsName.replace(/^CM\s+/i, ''))
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
