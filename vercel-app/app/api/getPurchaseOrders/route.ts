import { NextRequest } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'

/** 본사 발주 내역 조회 (기간, 거래처 필터 지원). 기간은 방콕 달력 기준. */
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
      const startStr = startDate.slice(0, 10)
      const endStr = endDate.slice(0, 10)
      if (startStr && endStr) {
        const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
        parts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
        parts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
      } else if (startStr) {
        const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, startStr)
        parts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
        parts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
      } else if (endStr) {
        const { startISO, endISOExclusive } = bangkokDateRangeToUtc(endStr, endStr)
        parts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
        parts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
      }
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
