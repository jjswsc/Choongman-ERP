import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 품목별 매입 가능 거래처 목록 (item_vendors + items.vendor) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const itemCode = String(searchParams.get('itemCode') || searchParams.get('code') || '').trim()

  if (!itemCode) {
    return NextResponse.json([], { headers })
  }

  try {
    const ivRows = (await supabaseSelectFilter(
      'item_vendors',
      `item_code=eq.${encodeURIComponent(itemCode)}`,
      { order: 'priority.asc,id.asc', select: 'vendor_code,priority,unit_price,min_order_qty,memo' }
    )) as { vendor_code?: string; priority?: number; unit_price?: number; min_order_qty?: number; memo?: string }[] | null

    const list = (ivRows || []).map((r) => ({
      vendorCode: String(r.vendor_code || ''),
      priority: Number(r.priority) || 0,
      unitPrice: r.unit_price != null ? Number(r.unit_price) : null,
      minOrderQty: r.min_order_qty != null ? Number(r.min_order_qty) : null,
      memo: String(r.memo || '').trim() || null,
    }))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getItemVendors:', e)
    return NextResponse.json([], { headers })
  }
}
