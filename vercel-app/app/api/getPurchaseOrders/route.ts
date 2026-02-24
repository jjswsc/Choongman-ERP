import { NextRequest } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'

/** 본사 발주 내역 조회 (기간, 거래처 필터 지원) */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const vendorCode = String(searchParams.get('vendorCode') || '').trim()
    const poId = Number(searchParams.get('poId') || searchParams.get('id') || 0)
    const startDate = String(searchParams.get('startDate') || '').trim()
    const endDate = String(searchParams.get('endDate') || '').trim()

    const parts: string[] = []
    if (poId && !isNaN(poId)) {
      parts.push(`id=eq.${poId}`)
    } else {
      parts.push('id=gt.0')
      if (vendorCode) parts.push(`vendor_code=eq.${encodeURIComponent(vendorCode)}`)
      if (startDate) parts.push(`created_at=gte.${startDate}T00:00:00.000Z`)
      if (endDate) parts.push(`created_at=lte.${endDate}T23:59:59.999Z`)
    }
    const filter = parts.join('&')
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
