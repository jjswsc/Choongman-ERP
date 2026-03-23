/**
 * 기간별 집계 (월/주/일/요일별). pos_orders 기반.
 * 건수·공급가액(subtotal)·세금(vat)·할인(discount_amt+coupon_discount_amt)·매출액(total).
 * 홀(dine_in): dineInTotal/dineInCount=테이블(건)당, dineInTotal/dineInGuestSum=1인당.
 * 조회 필터 전체: salesPerOrder = total/count (포장·배달 등 건당).
 * guestSum = 홀 외는 0이므로 SUM(guest_count)와 동일.
 * 차트·호환용 sales = total.
 */
import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc, toDateStrBangkok, getDayOfWeekBangkok } from '@/lib/attendance-utils'
import {
  normalizePosOrderTypeKey,
  parseOrderTypesParam,
  rowMatchesOrderFilter,
} from '@/lib/pos-sales-order-type-filter'

const COMPLETED_STATUSES = ['completed', 'paid', 'ready']

type Row = {
  created_at?: string
  total?: number
  subtotal?: number
  vat?: number
  discount_amt?: number
  coupon_discount_amt?: number
  store_code?: string
  status?: string
  order_type?: string
  guest_count?: number
}

type Bucket = {
  count: number
  subtotal: number
  vat: number
  discount: number
  total: number
  guestSum: number
  dineInOrderCount: number
  dineInTotal: number
  dineInGuestSum: number
}

function getStartOfWeek(d: Date): Date {
  const x = new Date(d)
  const day = x.getUTCDay()
  x.setUTCDate(x.getUTCDate() - day)
  x.setUTCHours(0, 0, 0, 0)
  return x
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const groupBy = searchParams.get('groupBy') || 'day'
    const pos = searchParams.get('pos')?.trim()
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startStr, endStr)
    let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
    if (pos && pos !== 'All') filter += `&store_code=ilike.${encodeURIComponent(pos)}`

    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      limit: 50000,
      select:
        'created_at,total,subtotal,vat,discount_amt,coupon_discount_amt,guest_count,store_code,status,order_type',
    })) as Row[]

    const byKey: Record<string, Bucket> = {}

    const add = (key: string, r: Row) => {
      const b = (byKey[key] ??= {
        count: 0,
        subtotal: 0,
        vat: 0,
        discount: 0,
        total: 0,
        guestSum: 0,
        dineInOrderCount: 0,
        dineInTotal: 0,
        dineInGuestSum: 0,
      })
      b.count += 1
      b.subtotal += Number(r.subtotal) || 0
      b.vat += Number(r.vat) || 0
      b.discount += (Number(r.discount_amt) || 0) + (Number(r.coupon_discount_amt) || 0)
      b.total += Number(r.total) || 0
      const gc = Math.max(0, Math.trunc(Number(r.guest_count) || 0))
      b.guestSum += gc
      {
        const k = normalizePosOrderTypeKey(r.order_type)
        if (k === 'dine_in' || k === '') {
          b.dineInOrderCount += 1
          b.dineInTotal += Number(r.total) || 0
          b.dineInGuestSum += gc
        }
      }
    }

    for (const r of rows) {
      if (!rowMatchesOrderFilter(r.order_type, orderTypesAllowed)) continue
      if (!COMPLETED_STATUSES.includes(String(r.status ?? ''))) continue
      const dt = r.created_at
      if (!dt) continue

      const bkkDate = toDateStrBangkok(dt)
      if (!bkkDate) continue

      if (groupBy === 'month') {
        add(bkkDate.slice(0, 7), r)
      } else if (groupBy === 'week') {
        const start = getStartOfWeek(new Date(dt))
        const end = new Date(start)
        end.setUTCDate(end.getUTCDate() + 6)
        const k = `${start.toISOString().slice(0, 10)}~${end.toISOString().slice(0, 10)}`
        add(k, r)
      } else if (groupBy === 'dow') {
        const dow = getDayOfWeekBangkok(bkkDate)
        add(String(dow), r)
      } else {
        add(bkkDate, r)
      }
    }

    const toRow = (k: string, v: Bucket) => ({
      label: k,
      key: k,
      sales: v.total,
      count: v.count,
      subtotal: v.subtotal,
      vat: v.vat,
      discount: v.discount,
      total: v.total,
      guestSum: v.guestSum,
      dineInOrderCount: v.dineInOrderCount,
      dineInTotal: v.dineInTotal,
      dineInGuestSum: v.dineInGuestSum,
      salesPerDineInOrder:
        v.dineInOrderCount > 0 ? Math.round((v.dineInTotal / v.dineInOrderCount) * 100) / 100 : 0,
      salesPerGuest:
        v.dineInGuestSum > 0 ? Math.round((v.dineInTotal / v.dineInGuestSum) * 100) / 100 : 0,
      salesPerOrder: v.count > 0 ? Math.round((v.total / v.count) * 100) / 100 : 0,
    })

    let result: ReturnType<typeof toRow>[]
    if (groupBy === 'month') {
      result = Object.entries(byKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => toRow(k, v))
    } else if (groupBy === 'week') {
      result = Object.entries(byKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => toRow(k, v))
    } else if (groupBy === 'dow') {
      result = [0, 1, 2, 3, 4, 5, 6].map((dow) =>
        toRow(String(dow), byKey[String(dow)] ?? {
          count: 0,
          subtotal: 0,
          vat: 0,
          discount: 0,
          total: 0,
          guestSum: 0,
          dineInOrderCount: 0,
          dineInTotal: 0,
          dineInGuestSum: 0,
        })
      )
    } else {
      result = Object.entries(byKey)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([k, v]) => toRow(k, v))
    }

    return NextResponse.json(result, { headers })
  } catch (e) {
    console.error('posSalesByPeriod:', e)
    return NextResponse.json([], { headers })
  }
}
