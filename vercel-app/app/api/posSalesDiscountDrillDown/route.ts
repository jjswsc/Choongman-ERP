/**
 * 할인 현황 드릴다운 — 유형·행 클릭 시 해당 주문 목록
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_DISCOUNT_DRILL_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import {
  collectPosSalesPaymentDiscountDrillOrders,
  collectPosSalesPromoBundleDrillOrders,
  type PosSalesDiscountDrillLayer,
} from '@/lib/pos-sales-discount-drill-down'
import type { PosPaymentDiscountKind } from '@/lib/pos-sales-payment-discount-aggregate'
import type { PosPromoSalesKind } from '@/lib/pos-promo-sales-kind'
import { loadPosSalesPromoPricingCatalog } from '@/lib/pos-sales-promo-pricing-catalog-server'

const PAYMENT_KINDS = new Set<string>(['manual', 'collab', 'coupon', 'platform', 'other'])
const BUNDLE_KINDS = new Set<string>(['set', 'campaign', 'platform', 'other'])

function parseLayer(raw: string | null): PosSalesDiscountDrillLayer | null {
  const v = String(raw ?? '').trim().toLowerCase()
  if (v === 'bundle' || v === 'payment') return v
  return null
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300')

  try {
    const { searchParams } = new URL(request.url)
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const layer = parseLayer(searchParams.get('layer'))
    const kind = String(searchParams.get('kind') ?? '').trim()
    const rowKey = String(searchParams.get('rowKey') ?? '').trim()
    const limitRaw = Number(searchParams.get('limit') ?? 200)
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(500, Math.trunc(limitRaw))) : 200

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }
    if (!layer) {
      return NextResponse.json({ success: false, message: 'layer 필요 (bundle|payment)' }, { headers })
    }
    if (!kind && !rowKey) {
      return NextResponse.json({ success: false, message: 'kind 또는 rowKey 필요' }, { headers })
    }

    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    const [{ rows, truncated }, catalog] = await Promise.all([
      fetchPosSalesOrdersForBusinessRange({
        startStr,
        endStr,
        storeCodes: stores.length > 0 ? stores : undefined,
        select: POS_SALES_DISCOUNT_DRILL_ROW_SELECT,
        queryLabel: 'posSalesDiscountDrillDown',
      }),
      loadPosSalesPromoPricingCatalog(),
    ])

    const completed = filterCompletedPosSalesRows(rows, orderTypesAllowed)
    const orders =
      layer === 'payment'
        ? collectPosSalesPaymentDiscountDrillOrders({
            orderRows: completed,
            filter: {
              kind: kind && PAYMENT_KINDS.has(kind) ? (kind as PosPaymentDiscountKind) : undefined,
              rowKey: rowKey || undefined,
            },
            limit,
          })
        : collectPosSalesPromoBundleDrillOrders({
            orderRows: completed,
            catalog,
            filter: {
              kind: kind && BUNDLE_KINDS.has(kind) ? (kind as PosPromoSalesKind) : undefined,
              promoKey: rowKey || undefined,
            },
            limit,
          })

    if (truncated) headers.set('X-Sales-Truncated', '1')

    return NextResponse.json(
      {
        success: true,
        layer,
        kind: kind || null,
        rowKey: rowKey || null,
        orders,
        truncated,
      },
      { headers }
    )
  } catch (e) {
    console.error('posSalesDiscountDrillDown:', e)
    return NextResponse.json(
      {
        success: false,
        message: String(e),
        orders: [],
        truncated: false,
      },
      { headers }
    )
  }
}
