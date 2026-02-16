import { NextRequest } from 'next/server'
import { supabaseSelect } from '@/lib/supabase-server'

/** 본사 발주 내역 조회 */
export async function GET(request: NextRequest) {
  try {
    const rows = (await supabaseSelect('purchase_orders', {
      order: 'created_at.desc',
      limit: 500,
    })) as {
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
