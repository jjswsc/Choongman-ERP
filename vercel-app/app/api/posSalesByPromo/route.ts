/**
 * 세트·프로모 + 결제 할인 통합 분석
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_DISCOUNT_ANALYTICS_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import {
  aggregatePosSalesPromoBundleDiscount,
  filterPromoSalesRows,
} from '@/lib/pos-sales-promo-discount-aggregate'
import {
  aggregatePosSalesPaymentDiscount,
  filterPaymentDiscountRows,
} from '@/lib/pos-sales-payment-discount-aggregate'
import { buildPosSalesCombinedDiscount } from '@/lib/pos-sales-combined-discount-aggregate'
import { loadPosSalesPromoPricingCatalog } from '@/lib/pos-sales-promo-pricing-catalog-server'

function parseSearchTokens(raw: string | null): string[] {
  return String(raw ?? '')
    .split(/[,\n]+/)
    .map((v) => v.trim().toLowerCase())
    .filter(Boolean)
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
    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )
    const searchTokens = parseSearchTokens(searchParams.get('search'))
    const searchMode = String(searchParams.get('searchMode') ?? 'or').toLowerCase()
    const searchAnd = searchMode === 'and' || searchMode === 'all'
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const [{ rows, truncated }, catalog] = await Promise.all([
      fetchPosSalesOrdersForBusinessRange({
      request,
        startStr,
        endStr,
        storeCodes: stores.length > 0 ? stores : undefined,
        select: POS_SALES_DISCOUNT_ANALYTICS_ROW_SELECT,
        queryLabel: 'posSalesByPromo',
      }),
      loadPosSalesPromoPricingCatalog(),
    ])

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'posSalesFetchRows')

    const completed = filterCompletedPosSalesRows(rows, orderTypesAllowed)
    const bundle = aggregatePosSalesPromoBundleDiscount({
      orderRows: completed,
      catalog,
    })
    const payment = aggregatePosSalesPaymentDiscount({ orderRows: completed })
    const combined = buildPosSalesCombinedDiscount({
      periodGrossSales: bundle.totals.periodGrossSales,
      periodOrderCount: bundle.totals.periodOrderCount,
      bundleDiscount: bundle.totals.bundleDiscount,
      paymentDiscount: payment.totals.discountAmount,
      promoLineSaleAmount: bundle.totals.saleAmount,
      paymentOrderCountWithDiscount: payment.totals.orderCountWithDiscount,
      bundleByKind: bundle.byKind,
      paymentByKind: payment.byKind,
    })

    const rowsOut = filterPromoSalesRows(bundle.rows, searchTokens, searchAnd).slice(0, 500)
    const paymentRowsOut = filterPaymentDiscountRows(payment.rows, searchTokens, searchAnd).slice(
      0,
      500
    )

    return NextResponse.json(
      {
        rows: rowsOut,
        totals: bundle.totals,
        byKind: bundle.byKind,
        payment: {
          rows: paymentRowsOut,
          totals: payment.totals,
          byKind: payment.byKind,
        },
        combined,
        truncated,
      },
      { headers }
    )
  } catch (e) {
    console.error('posSalesByPromo:', e)
    return NextResponse.json(
      {
        rows: [],
        totals: {
          qty: 0,
          saleAmount: 0,
          regularAmount: 0,
          bundleDiscount: 0,
          paymentDiscount: 0,
          totalDiscount: 0,
          periodGrossSales: 0,
          periodOrderCount: 0,
          promoLineSaleSharePct: 0,
          bundleDiscountPctOfGross: 0,
          paymentDiscountPctOfGross: 0,
          totalDiscountPctOfGross: 0,
          estimatedLineQty: 0,
          unresolvedLineQty: 0,
        },
        byKind: [],
        payment: {
          rows: [],
          totals: {
            discountAmount: 0,
            orderCountWithDiscount: 0,
            periodGrossSales: 0,
            periodOrderCount: 0,
            discountPctOfGross: 0,
          },
          byKind: [],
        },
        combined: {
          totals: {
            periodGrossSales: 0,
            periodOrderCount: 0,
            bundleDiscount: 0,
            paymentDiscount: 0,
            totalDiscount: 0,
            bundleDiscountPctOfGross: 0,
            paymentDiscountPctOfGross: 0,
            totalDiscountPctOfGross: 0,
            promoLineSaleSharePct: 0,
            promoLineSaleAmount: 0,
            paymentOrderSharePct: 0,
          },
          byKind: [],
        },
        truncated: false,
      },
      { headers }
    )
  }
}
