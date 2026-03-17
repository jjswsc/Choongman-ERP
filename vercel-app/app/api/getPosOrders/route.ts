import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { toDateStrBangkok } from '@/lib/attendance-utils'

/** POS 주문 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const status = String(searchParams.get('status') || '').trim()

  try {
    let rows: {
      id?: number
      order_no?: string
      store_code?: string
      order_type?: string
      table_name?: string
      memo?: string
      discount_amt?: number
      discount_reason?: string
      delivery_fee?: number
      packaging_fee?: number
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_other?: number
      member_id?: number
      member_no?: string
      coupon_code?: string
      coupon_discount_amt?: number
      point_used?: number
      point_earned?: number
      items_json?: string
      subtotal?: number
      vat?: number
      total?: number
      status?: string
      created_at?: string
    }[] = []

    const filters: string[] = []
    if (storeCode && storeCode !== 'All') {
      filters.push(`store_code=ilike.${encodeURIComponent(storeCode)}`)
    }
    if (status && status !== 'all') {
      filters.push(`status=eq.${encodeURIComponent(status)}`)
    }
    const filterStr = filters.length ? filters.join('&') : ''

    if (filterStr) {
      rows = (await supabaseSelectFilter('pos_orders', filterStr, {
        order: 'created_at.desc',
        limit: 500,
        select: 'id,order_no,store_code,order_type,table_name,memo,discount_amt,discount_reason,delivery_fee,packaging_fee,payment_cash,payment_card,payment_qr,payment_other,member_id,member_no,coupon_code,coupon_discount_amt,point_used,point_earned,items_json,subtotal,vat,total,status,created_at',
      })) as typeof rows

      if (!rows?.length && storeCode) {
        const variants = [
          storeCode.startsWith('CM ') ? storeCode.slice(3).trim() : `CM ${storeCode}`.trim(),
          storeCode.replace(/^CM\s+/i, '').trim(),
        ].filter((v) => v && v !== storeCode)
        for (const alt of variants) {
          const altFilter = `store_code=ilike.${encodeURIComponent(alt)}`
          rows = (await supabaseSelectFilter('pos_orders', altFilter, {
            order: 'created_at.desc',
            limit: 500,
            select: 'id,order_no,store_code,order_type,table_name,memo,discount_amt,discount_reason,delivery_fee,packaging_fee,payment_cash,payment_card,payment_qr,payment_other,member_id,member_no,coupon_code,coupon_discount_amt,point_used,point_earned,items_json,subtotal,vat,total,status,created_at',
          })) as typeof rows
          if (rows?.length) break
        }
      }
    } else {
      rows = (await supabaseSelect('pos_orders', {
        order: 'created_at.desc',
        limit: 500,
        select: 'id,order_no,store_code,order_type,table_name,memo,discount_amt,discount_reason,delivery_fee,packaging_fee,payment_cash,payment_card,payment_qr,payment_other,member_id,member_no,coupon_code,coupon_discount_amt,point_used,point_earned,items_json,subtotal,vat,total,status,created_at',
      })) as typeof rows
    }

    const startDate = startStr ? startStr.slice(0, 10) : ''
    const endDate = endStr ? endStr.slice(0, 10) : ''

    const list = (rows || [])
      .filter((r) => {
        const rowDate = toDateStrBangkok(r.created_at)
        if (!rowDate) return false
        if (startDate && rowDate < startDate) return false
        if (endDate && rowDate > endDate) return false
        return true
      })
      .map((r) => ({
        id: r.id,
        orderNo: String(r.order_no ?? ''),
        storeCode: String(r.store_code ?? ''),
        orderType: String(r.order_type ?? 'dine_in'),
        tableName: String(r.table_name ?? ''),
        memo: String(r.memo ?? ''),
        discountAmt: Number(r.discount_amt) ?? 0,
        discountReason: String(r.discount_reason ?? ''),
        deliveryFee: Number(r.delivery_fee) ?? 0,
        packagingFee: Number(r.packaging_fee) ?? 0,
        paymentCash: Number(r.payment_cash) ?? 0,
        paymentCard: Number(r.payment_card) ?? 0,
        paymentQr: Number(r.payment_qr) ?? 0,
        paymentOther: Number(r.payment_other) ?? 0,
        memberId: Number(r.member_id) || 0,
        memberNo: String(r.member_no ?? ''),
        couponCode: String(r.coupon_code ?? ''),
        couponDiscountAmt: Number(r.coupon_discount_amt) ?? 0,
        pointUsed: Number(r.point_used) ?? 0,
        pointEarned: Number(r.point_earned) ?? 0,
        items: (() => {
          try {
            const arr = JSON.parse(r.items_json || '[]')
            return Array.isArray(arr) ? arr : []
          } catch {
            return []
          }
        })(),
        subtotal: Number(r.subtotal) ?? 0,
        vat: Number(r.vat) ?? 0,
        total: Number(r.total) ?? 0,
        status: String(r.status ?? 'pending'),
        createdAt: String(r.created_at ?? ''),
      }))

    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosOrders:', e)
    return NextResponse.json([], { headers })
  }
}
