import { NextRequest } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 본사 발주 내역 조회 (vendorCode로 필터 가능) */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorCode = String(searchParams.get('vendorCode') || '').trim()
    const poId = Number(searchParams.get('poId') || searchParams.get('id') || 0)
    let filter = vendorCode ? `vendor_code=eq.${encodeURIComponent(vendorCode)}` : undefined
    if (poId && !isNaN(poId)) filter = `id=eq.${poId}`
    else if (!filter) filter = 'id=gt.0'
    const rows = (await supabaseSelectFilter(
      'purchase_orders',
      filter,
      { order: 'created_at.desc', limit: 500 }
    )) as {
      id?: number
      po_no?: string
      vendor_code?: string
      vendor_name?: string
      location_name?: string
      location_address?: string
      location_code?: string
      cart_json?: string
      subtotal?: number
      vat?: number
      total?: number
      user_name?: string
      status?: string
      created_at?: string
    }[]
    return Response.json(rows || [])
  } catch (e) {
    console.error('getPurchaseOrders:', e)
    return Response.json(
      { error: e instanceof Error ? e.message : 'Failed' },
      { status: 500 }
    )
  }
}
