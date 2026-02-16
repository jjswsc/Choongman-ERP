import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter, supabaseInsert } from '@/lib/supabase-server'

export async function POST(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')

  try {
    const body = await request.json()
    const vendorCode = String(body.vendorCode || '').trim()
    const vendorName = String(body.vendorName || '').trim()
    const locationName = String(body.locationName || '').trim()
    const locationAddress = String(body.locationAddress || '').trim()
    const locationCode = String(body.locationCode || '').trim()
    const cart = Array.isArray(body.cart) ? body.cart : []
    const userName = String(body.userName || '').trim()

    if (!vendorCode || !vendorName || cart.length === 0) {
      return NextResponse.json(
        { success: false, message: 'vendorCode, vendorName, cart required' },
        { status: 400, headers }
      )
    }

    let subtotal = 0
    for (const c of cart) {
      const price = Number(c.price || c.cost || 0)
      const qty = Number(c.qty || 0)
      subtotal += price * qty
    }
    const vat = Math.round(subtotal * 0.07)
    const total = subtotal + vat

    const poNo =
      'PO-' +
      new Date().toISOString().slice(0, 10).replace(/-/g, '') +
      '-' +
      String(Date.now()).slice(-4)

    const row = {
      po_no: poNo,
      vendor_code: vendorCode,
      vendor_name: vendorName,
      location_name: locationName,
      location_address: locationAddress,
      location_code: locationCode,
      cart_json: JSON.stringify(cart),
      subtotal,
      vat,
      total,
      user_name: userName,
      status: 'Draft',
    }

    const inserted = (await supabaseInsert('purchase_orders', row)) as { id?: number }[]
    const id = Array.isArray(inserted) && inserted[0]?.id != null ? inserted[0].id : null

    return NextResponse.json(
      { success: true, id, poNo, message: '발주가 저장되었습니다.' },
      { headers }
    )
  } catch (e) {
    console.error('savePurchaseOrder:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : 'Save failed' },
      { status: 500, headers }
    )
  }
}
