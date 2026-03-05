import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 본사 발주용: vendor 코드 또는 이름으로 품목 목록 조회
 * - items.vendor = code/name (기존) + item_vendors 매핑 (다대다)
 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const vendorCode = String(searchParams.get('vendorCode') || searchParams.get('vendor') || '').trim()
  const vendorName = String(searchParams.get('vendorName') || '').trim()
  const outboundLocation = String(searchParams.get('outboundLocation') || '').trim()

  if (!vendorCode && !vendorName) {
    return NextResponse.json([], { headers })
  }

  try {
    type ItemRow = {
      code?: string
      name?: string
      spec?: string
      price?: number
      cost?: number
      category?: string
      image?: string
      outbound_location?: string
      tax?: string
    }
    const codeSet = new Set<string>()
    const rowsMap = new Map<string, ItemRow>()

    const addRow = (r: ItemRow) => {
      const c = String(r.code || '')
      if (c && !codeSet.has(c)) {
        codeSet.add(c)
        rowsMap.set(c, r)
      }
    }

    const hqFilter = `or=(purchase_source.eq.hq,purchase_source.is.null)`
    let rowsByVendor: ItemRow[] | null = []
    if (vendorCode) {
      const enc = encodeURIComponent(vendorCode)
      rowsByVendor = (await supabaseSelectFilter(
        'items',
        `vendor=ilike.${enc}&${hqFilter}`,
        { order: 'code.asc', limit: 1000, select: 'code,name,spec,price,cost,category,image,outbound_location,tax' }
      )) as ItemRow[] | null
    }
    if ((!rowsByVendor || rowsByVendor.length === 0) && vendorName) {
      const encName = encodeURIComponent(vendorName)
      rowsByVendor = (await supabaseSelectFilter(
        'items',
        `vendor=ilike.${encName}&${hqFilter}`,
        { order: 'code.asc', limit: 1000, select: 'code,name,spec,price,cost,category,image,outbound_location,tax' }
      )) as ItemRow[] | null
    }
    for (const r of rowsByVendor || []) addRow(r)

    try {
      const encVc = encodeURIComponent(vendorCode)
      const ivRows = (await supabaseSelectFilter(
        'item_vendors',
        `vendor_code=ilike.${encVc}`,
        { select: 'item_code', limit: 1000 }
      )) as { item_code?: string }[] | null
      const itemCodesFromMap = (ivRows || []).map((x) => String(x.item_code || '').trim()).filter(Boolean)
      if (itemCodesFromMap.length > 0) {
        for (const ic of itemCodesFromMap) {
          if (codeSet.has(ic)) continue
          const itemRows = (await supabaseSelectFilter(
            'items',
            `code=eq.${encodeURIComponent(ic)}&${hqFilter}`,
            { limit: 1, select: 'code,name,spec,price,cost,category,image,outbound_location,tax' }
          )) as ItemRow[] | null
          for (const r of itemRows || []) addRow(r)
        }
      }
      if (vendorName && vendorName.toLowerCase() !== vendorCode.toLowerCase()) {
        const encVn = encodeURIComponent(vendorName)
        const ivRowsByName = (await supabaseSelectFilter(
          'item_vendors',
          `vendor_code=ilike.${encVn}`,
          { select: 'item_code', limit: 1000 }
        )) as { item_code?: string }[] | null
        const codesByName = (ivRowsByName || []).map((x) => String(x.item_code || '').trim()).filter(Boolean)
        for (const ic of codesByName) {
          if (codeSet.has(ic)) continue
          const itemRows = (await supabaseSelectFilter(
            'items',
            `code=eq.${encodeURIComponent(ic)}&${hqFilter}`,
            { limit: 1, select: 'code,name,spec,price,cost,category,image,outbound_location,tax' }
          )) as ItemRow[] | null
          for (const r of itemRows || []) addRow(r)
        }
      }
    } catch (_) {
      // item_vendors 테이블 미존재 시 무시
    }

    let filtered = Array.from(rowsMap.values()).sort((a, b) =>
      String(a.code || '').localeCompare(String(b.code || ''))
    )
    if (outboundLocation) {
      filtered = filtered.filter(
        (r) => !r.outbound_location || r.outbound_location === outboundLocation
      )
    }

    const list = filtered.map((row) => {
      const tax = String(row.tax || '').trim()
      const taxType = tax === '면세' ? 'exempt' : tax === '영세율' ? 'zero' : 'taxable'
      return {
        code: String(row.code || ''),
        name: String(row.name || ''),
        spec: String(row.spec || ''),
        price: Number(row.price) || 0,
        cost: Number(row.cost) || 0,
        category: String(row.category || ''),
        image: String(row.image || ''),
        outbound_location: String(row.outbound_location || ''),
        taxType,
      }
    })

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getItemsByVendor:', e)
    return NextResponse.json([], { headers })
  }
}
