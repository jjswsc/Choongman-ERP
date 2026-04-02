import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { toDateStrBangkok, bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'

const POS_ORDER_SELECT =
  'id,order_no,store_code,order_type,table_name,memo,discount_amt,discount_reason,delivery_fee,packaging_fee,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,delivery_payment_channel,member_id,member_no,coupon_code,coupon_discount_amt,point_used,point_earned,guest_count,items_json,subtotal,vat,total,status,created_at,linkpos_provider,linkpos_mode,linkpos_tx_code,linkpos_bank_id,linkpos_response_code,linkpos_approval_code,linkpos_trace_no,linkpos_ref_no,linkpos_terminal_id,linkpos_merchant_id,linkpos_reference1,linkpos_requested_amount,linkpos_approved_amount,linkpos_requested_at,linkpos_responded_at'

/** POS 주문 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const status = String(searchParams.get('status') || '').trim()
  const sinceIdRaw = searchParams.get('sinceId')?.trim()
  const sinceId = sinceIdRaw && /^\d+$/.test(sinceIdRaw) ? parseInt(sinceIdRaw, 10) : null
  const orderIdRaw = searchParams.get('orderId')?.trim()
  const orderId = orderIdRaw && /^\d+$/.test(orderIdRaw) ? parseInt(orderIdRaw, 10) : null

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
      guest_count?: number
      items_json?: string
      subtotal?: number
      vat?: number
      total?: number
      status?: string
      created_at?: string
      linkpos_provider?: string
      linkpos_mode?: string
      linkpos_tx_code?: string
      linkpos_bank_id?: string
      linkpos_response_code?: string
      linkpos_approval_code?: string
      linkpos_trace_no?: string
      linkpos_ref_no?: string
      linkpos_terminal_id?: string
      linkpos_merchant_id?: string
      linkpos_reference1?: string
      linkpos_requested_amount?: number
      linkpos_approved_amount?: number
      linkpos_requested_at?: string
      linkpos_responded_at?: string
    }[] = []

    const startDate = startStr ? startStr.slice(0, 10) : ''
    const endDate = endStr ? endStr.slice(0, 10) : ''

    /** 단건 id 조회: Realtime UPDATE 후 풀 행 보강용 */
    if (orderId != null && orderId > 0) {
      const idFilters = [`id=eq.${orderId}`]
      if (storeCode && storeCode !== 'All') {
        idFilters.push(`store_code=ilike.${encodeURIComponent(storeCode)}`)
      }
      let idRows = (await supabaseSelectFilter('pos_orders', idFilters.join('&'), {
        order: 'created_at.desc',
        limit: 1,
        select: POS_ORDER_SELECT,
      })) as typeof rows

      if (!idRows?.length && storeCode) {
        const variants = [
          storeCode.startsWith('CM ') ? storeCode.slice(3).trim() : `CM ${storeCode}`.trim(),
          storeCode.replace(/^CM\s+/i, '').trim(),
        ].filter((v) => v && v !== storeCode)
        for (const alt of variants) {
          const altFilter = `id=eq.${orderId}&store_code=ilike.${encodeURIComponent(alt)}`
          idRows = (await supabaseSelectFilter('pos_orders', altFilter, {
            order: 'created_at.desc',
            limit: 1,
            select: POS_ORDER_SELECT,
          })) as typeof rows
          if (idRows?.length) break
        }
      }

      rows = idRows || []
    } else {
      const filters: string[] = []
      if (startDate && endDate) {
        const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startDate, endDate)
        filters.push(`created_at=gte.${encodeURIComponent(startISO)}`)
        filters.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
      }
      if (storeCode && storeCode !== 'All') {
        filters.push(`store_code=ilike.${encodeURIComponent(storeCode)}`)
      }
      if (status && status !== 'all') {
        filters.push(`status=eq.${encodeURIComponent(status)}`)
      }
      if (sinceId != null && sinceId > 0) {
        filters.push(`id=gt.${sinceId}`)
      }
      const filterStr = filters.length ? filters.join('&') : ''

      if (filterStr) {
        rows = (await supabaseSelectFilter('pos_orders', filterStr, {
          order: 'created_at.desc',
          limit: 10000,
          select: POS_ORDER_SELECT,
        })) as typeof rows

        if (!rows?.length && storeCode) {
          const variants = [
            storeCode.startsWith('CM ') ? storeCode.slice(3).trim() : `CM ${storeCode}`.trim(),
            storeCode.replace(/^CM\s+/i, '').trim(),
          ].filter((v) => v && v !== storeCode)
          for (const alt of variants) {
            const altParts = [`store_code=ilike.${encodeURIComponent(alt)}`]
            if (startDate && endDate) {
              const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startDate, endDate)
              altParts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
              altParts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
            }
            const altFilter = altParts.join('&')
            rows = (await supabaseSelectFilter('pos_orders', altFilter, {
              order: 'created_at.desc',
              limit: 10000,
              select: POS_ORDER_SELECT,
            })) as typeof rows
            if (rows?.length) break
          }
        }
      } else {
        rows = (await supabaseSelect('pos_orders', {
          order: 'created_at.desc',
          limit: 10000,
          select: POS_ORDER_SELECT,
        })) as typeof rows
      }
    }

    if (process.env.NODE_ENV === 'development') {
      console.log('[getPosOrders]', { rowCount: (rows || []).length, startDate, endDate, storeCode: storeCode || '(all)', status: status || '(all)', sinceId: sinceId ?? '(none)' })
    }

    const list = (rows || [])
      .filter((r) => {
        if (startDate && endDate) return true
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
        orderType: coercePosOrderTypeForDb(r.order_type),
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
        paymentDeliveryApp: Number((r as { payment_delivery_app?: number }).payment_delivery_app) || 0,
        deliveryPaymentChannel: (() => {
          const c = String((r as { delivery_payment_channel?: string }).delivery_payment_channel ?? '').trim()
          return c || undefined
        })(),
        memberId: Number(r.member_id) || 0,
        memberNo: String(r.member_no ?? ''),
        couponCode: String(r.coupon_code ?? ''),
        couponDiscountAmt: Number(r.coupon_discount_amt) ?? 0,
        pointUsed: Number(r.point_used) ?? 0,
        pointEarned: Number(r.point_earned) ?? 0,
        guestCount: Math.max(0, Math.trunc(Number(r.guest_count) || 0)),
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
        linkposProvider: String(r.linkpos_provider ?? ''),
        linkposMode: String(r.linkpos_mode ?? ''),
        linkposTxCode: String(r.linkpos_tx_code ?? ''),
        linkposBankId: String(r.linkpos_bank_id ?? ''),
        linkposResponseCode: String(r.linkpos_response_code ?? ''),
        linkposApprovalCode: String(r.linkpos_approval_code ?? ''),
        linkposTraceNo: String(r.linkpos_trace_no ?? ''),
        linkposRefNo: String(r.linkpos_ref_no ?? ''),
        linkposTerminalId: String(r.linkpos_terminal_id ?? ''),
        linkposMerchantId: String(r.linkpos_merchant_id ?? ''),
        linkposReference1: String(r.linkpos_reference1 ?? ''),
        linkposRequestedAmount: Number(r.linkpos_requested_amount ?? 0),
        linkposApprovedAmount: Number(r.linkpos_approved_amount ?? 0),
        linkposRequestedAt: String(r.linkpos_requested_at ?? ''),
        linkposRespondedAt: String(r.linkpos_responded_at ?? ''),
      }))

    if (process.env.NODE_ENV === 'development') {
      console.log('[getPosOrders] result count:', list.length)
    }
    headers.set('X-Pos-Orders-Count', String(list.length))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosOrders:', e)
    return NextResponse.json([], { headers })
  }
}
