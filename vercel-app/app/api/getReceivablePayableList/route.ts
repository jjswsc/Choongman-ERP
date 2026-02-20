/**
 * 미수금/미지급금 목록 조회
 * - type: receivable | payable
 * - storeFilter / vendorFilter (선택)
 * - startStr, endStr (trans_date 범위)
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const type = String(searchParams.get('type') || 'receivable').trim().toLowerCase()
  const storeFilter = searchParams.get('storeFilter') || searchParams.get('store') || ''
  const vendorFilter = searchParams.get('vendorFilter') || searchParams.get('vendor') || ''
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim().slice(0, 10)
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim().slice(0, 10)

  try {
    if (type === 'payable') {
      const parts: string[] = []
      if (vendorFilter) parts.push(`vendor_code=ilike.${encodeURIComponent(vendorFilter)}`)
      if (startStr) parts.push(`trans_date=gte.${startStr}`)
      if (endStr) parts.push(`trans_date=lte.${endStr}`)
      const filter = parts.length ? parts.join('&') : 'id=gt.0'
      const rows = (await supabaseSelectFilter(
        'payable_transactions',
        filter,
        { order: 'trans_date.desc', limit: 1000 }
      )) as { id?: number; vendor_code?: string; amount?: number; ref_type?: string; ref_id?: number; trans_date?: string; memo?: string; created_at?: string }[]

      const byVendor: Record<string, { total: number; items: typeof rows }> = {}
      for (const r of rows || []) {
        const vc = String(r.vendor_code || '').trim()
        if (!vc) continue
        if (!byVendor[vc]) byVendor[vc] = { total: 0, items: [] }
        byVendor[vc].items.push(r)
        byVendor[vc].total += Number(r.amount ?? 0)
      }

      const list = Object.entries(byVendor).map(([vendorCode, v]) => ({
        vendorCode,
        balance: v.total,
        items: v.items.sort((a, b) => (String(b.trans_date || '').localeCompare(String(a.trans_date || '')))),
      }))

      return NextResponse.json({ type: 'payable', list }, { headers })
    }

    // receivable
    const parts: string[] = []
    if (storeFilter) parts.push(`store_name=ilike.${encodeURIComponent(storeFilter)}`)
    if (startStr) parts.push(`trans_date=gte.${startStr}`)
    if (endStr) parts.push(`trans_date=lte.${endStr}`)
    const filter = parts.length ? parts.join('&') : 'id=gt.0'
    const rows = (await supabaseSelectFilter(
      'receivable_transactions',
      filter,
      { order: 'trans_date.desc', limit: 1000 }
    )) as { id?: number; store_name?: string; amount?: number; ref_type?: string; ref_id?: number; trans_date?: string; memo?: string; created_at?: string }[]

    const byStore: Record<string, { total: number; items: typeof rows }> = {}
    for (const r of rows || []) {
      const sn = String(r.store_name || '').trim()
      if (!sn) continue
      if (!byStore[sn]) byStore[sn] = { total: 0, items: [] }
      byStore[sn].items.push(r)
      byStore[sn].total += Number(r.amount ?? 0)
    }

    const list = Object.entries(byStore).map(([storeName, v]) => ({
      storeName,
      balance: v.total,
      items: v.items.sort((a, b) => (String(b.trans_date || '').localeCompare(String(a.trans_date || '')))),
    }))

    return NextResponse.json({ type: 'receivable', list }, { headers })
  } catch (e) {
    console.error('getReceivablePayableList:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500, headers }
    )
  }
}
