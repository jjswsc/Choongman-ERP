import { NextRequest, NextResponse } from 'next/server'
import { supabaseDeleteByFilter, supabaseInsertMany } from '@/lib/supabase-server'

/** 품목별 매입 거래처 저장 (item_vendors 테이블) */
export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = (await request.json()) as {
      itemCode?: string
      vendors?: { vendorCode: string; priority?: number; unitPrice?: number | null; minOrderQty?: number | null; memo?: string | null }[]
    }
    const itemCode = String(body.itemCode || body.code || '').trim()
    const vendors = Array.isArray(body.vendors) ? body.vendors : []

    if (!itemCode) {
      return NextResponse.json({ success: false, message: 'itemCode is required' }, { headers })
    }

    await supabaseDeleteByFilter('item_vendors', `item_code=eq.${encodeURIComponent(itemCode)}`)

    const rows: Record<string, unknown>[] = vendors
      .filter((v) => String(v.vendorCode || '').trim())
      .map((v) => ({
        item_code: itemCode,
        vendor_code: String(v.vendorCode || '').trim(),
        priority: Number(v.priority) || 0,
        unit_price: v.unitPrice != null ? Number(v.unitPrice) : null,
        min_order_qty: v.minOrderQty != null ? Number(v.minOrderQty) : null,
        memo: v.memo != null ? String(v.memo).trim() : null,
      }))

    if (rows.length > 0) {
      await supabaseInsertMany('item_vendors', rows)
    }

    return NextResponse.json({ success: true }, { headers })
  } catch (e) {
    console.error('saveItemVendors:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { headers }
    )
  }
}
