import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

function normalizeOutboundKey(s: string): string {
  return String(s || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * 품목의 outbound_location과 발주 화면 출고지 선택값이 같은 창고인지 판별.
 * - 비어 있으면 모든 출고지에 표시(기존 동작)
 * - code·name 불일치, 대소문자/공백, "S&J Global" vs "S&J Global Co., Ltd." 등 완화 매칭
 */
function itemOutboundMatchesSelection(itemOutboundRaw: string, selectedParts: string[]): boolean {
  const itemRaw = String(itemOutboundRaw || '').trim()
  if (!itemRaw) return true
  const candidates = [...new Set(selectedParts.map((x) => String(x || '').trim()).filter(Boolean))]
  if (candidates.length === 0) return true
  const itemNorm = normalizeOutboundKey(itemRaw)
  for (const c of candidates) {
    const cn = normalizeOutboundKey(c)
    if (!cn) continue
    if (itemNorm === cn) return true
    const minLen = Math.min(itemNorm.length, cn.length)
    // 짧은 코드/이름 오매칭 방지: 충분히 긴 문자열끼리만 부분 일치 허용
    if (minLen >= 6 && (itemNorm.includes(cn) || cn.includes(itemNorm))) return true
  }
  return false
}

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
  const outboundLocationName = String(searchParams.get('outboundLocationName') || '').trim()

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

    const selectCols = 'code,name,spec,price,cost,category,image,outbound_location,tax,purchase_source'
    const selectColsMinimal = 'code,name,spec,price,cost,category,image,outbound_location,tax'
    const hqFilter = `or=(purchase_source.eq.hq,purchase_source.is.null,purchase_source.eq.)`
    /** 본사 발주: purchase_source=store 또는 category=매장 전용/Store Only 제외 */
    const isHqItem = (r: ItemRow & { purchase_source?: string }) => {
      const ps = String(r.purchase_source || '').trim().toLowerCase()
      if (ps === 'store') return false
      const cat = String(r.category || '').trim().toLowerCase().replace(/\s+/g, ' ')
      if (cat === '매장 전용' || cat === '매장전용' || cat === 'store only' || cat === 'storeonly') return false
      if (/\bstore\s*only\b/i.test(cat) || /매장\s*전용/.test(cat)) return false
      return ps === '' || ps === 'hq' || !ps
    }
    let rowsByVendor: (ItemRow & { purchase_source?: string })[] | null = []
    const runItemsQuery = async (vendorVal: string, withHq: boolean) => {
      const enc = encodeURIComponent(vendorVal)
      const filter = withHq ? `vendor=ilike.*${enc}*&${hqFilter}` : `vendor=ilike.*${enc}*`
      const select = withHq ? selectCols : selectColsMinimal
      return (await supabaseSelectFilter('items', filter, {
        order: 'code.asc',
        limit: 1000,
        select,
      })) as (ItemRow & { purchase_source?: string })[]
    }
    if (vendorCode) {
      try {
        rowsByVendor = await runItemsQuery(vendorCode, true)
        if (rowsByVendor?.length) rowsByVendor = rowsByVendor.filter((r) => isHqItem(r))
      } catch {
        try {
          rowsByVendor = await runItemsQuery(vendorCode, false)
          if (rowsByVendor?.length) rowsByVendor = rowsByVendor.filter((r) => isHqItem(r))
        } catch {
          rowsByVendor = []
        }
      }
    }
    if ((!rowsByVendor || rowsByVendor.length === 0) && vendorName) {
      try {
        rowsByVendor = await runItemsQuery(vendorName, true)
        if (rowsByVendor?.length) rowsByVendor = rowsByVendor.filter((r) => isHqItem(r))
      } catch {
        try {
          rowsByVendor = await runItemsQuery(vendorName, false)
          if (rowsByVendor?.length) rowsByVendor = rowsByVendor.filter((r) => isHqItem(r))
        } catch {
          rowsByVendor = []
        }
      }
    }
    if ((!rowsByVendor || rowsByVendor.length === 0) && vendorCode) {
      try {
        rowsByVendor = await runItemsQuery(vendorCode, false)
        if (rowsByVendor?.length) rowsByVendor = rowsByVendor.filter((r) => isHqItem(r))
      } catch {
        rowsByVendor = []
      }
    }
    for (const r of rowsByVendor || []) addRow(r)

    try {
      if (vendorCode) {
        const encVc = encodeURIComponent(vendorCode)
        const ivRows = (await supabaseSelectFilter(
          'item_vendors',
          `vendor_code=ilike.*${encVc}*`,
          { select: 'item_code', limit: 1000 }
        )) as { item_code?: string }[] | null
        const itemCodesFromMap = (ivRows || []).map((x) => String(x.item_code || '').trim()).filter(Boolean)
        if (itemCodesFromMap.length > 0) {
          for (const ic of itemCodesFromMap) {
            if (codeSet.has(ic)) continue
            try {
              let itemRows = (await supabaseSelectFilter(
                'items',
                `code=eq.${encodeURIComponent(ic)}&${hqFilter}`,
                { limit: 1, select: selectCols }
              )) as (ItemRow & { purchase_source?: string })[] | null
              if (itemRows?.length && !isHqItem(itemRows[0])) itemRows = []
              if ((!itemRows || itemRows.length === 0) && hqFilter) {
                itemRows = (await supabaseSelectFilter(
                  'items',
                  `code=eq.${encodeURIComponent(ic)}`,
                  { limit: 1, select: selectCols }
                )) as ItemRow[] | null
                if (itemRows?.length && !isHqItem(itemRows[0] as ItemRow & { purchase_source?: string })) itemRows = []
              }
              for (const r of itemRows || []) addRow(r)
            } catch {
              /* skip item */
            }
          }
        }
      }
      if (vendorName && vendorName.trim()) {
        const encVn = encodeURIComponent(vendorName.trim())
        const ivRowsByName = (await supabaseSelectFilter(
          'item_vendors',
          `vendor_code=ilike.*${encVn}*`,
          { select: 'item_code', limit: 1000 }
        )) as { item_code?: string }[] | null
        const codesByName = (ivRowsByName || []).map((x) => String(x.item_code || '').trim()).filter(Boolean)
        for (const ic of codesByName) {
          if (codeSet.has(ic)) continue
          try {
            let itemRows = (await supabaseSelectFilter(
              'items',
              `code=eq.${encodeURIComponent(ic)}&${hqFilter}`,
              { limit: 1, select: selectCols }
            )) as (ItemRow & { purchase_source?: string })[] | null
            if (itemRows?.length && !isHqItem(itemRows[0])) itemRows = []
            if ((!itemRows || itemRows.length === 0) && hqFilter) {
              itemRows = (await supabaseSelectFilter(
                'items',
                `code=eq.${encodeURIComponent(ic)}`,
                { limit: 1, select: selectCols }
              )) as ItemRow[] | null
              if (itemRows?.length && !isHqItem(itemRows[0] as ItemRow & { purchase_source?: string })) itemRows = []
            }
            for (const r of itemRows || []) addRow(r)
          } catch {
            /* skip item */
          }
        }
      }
    } catch (_) {
      // item_vendors 테이블 미존재 시 무시
    }

    let filtered = Array.from(rowsMap.values())
      .filter((r) => isHqItem(r as ItemRow & { purchase_source?: string }))
      .sort((a, b) => String(a.code || '').localeCompare(String(b.code || '')))
    if (outboundLocation || outboundLocationName) {
      const selectedParts = [outboundLocation, outboundLocationName]
      filtered = filtered.filter((r) =>
        itemOutboundMatchesSelection(String(r.outbound_location || ''), selectedParts)
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
