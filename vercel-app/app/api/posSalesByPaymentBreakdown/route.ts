/**
 * 매출 관리 Payment/Card — 배달·카드 세부.
 * Credit: POS 결산(card/qr/other breakdown) 우선 → 미결산 매장만 Kasikorn LINKPOS.
 * Delivery: POS 결산(delivery_app_breakdown) 우선 → 없으면 주문 payment_delivery_app.
 */
import { NextRequest, NextResponse } from 'next/server'
import { parseOrderTypesParam } from '@/lib/pos-sales-order-type-filter'
import { resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import { resolvePosSalesStoresFromRequest } from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_PAYMENT_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { filterCompletedPosSalesRows } from '@/lib/pos-sales-period-aggregate'
import {
  aggregateDeliveryPaymentChannelSales,
  sumDeliveryPaymentChannelSales,
} from '@/lib/pos-sales-delivery-payment-channel-aggregate'
import {
  creditPaymentBucketToRows,
  mergeCreditPaymentBuckets,
  sumCreditPaymentChannelSales,
} from '@/lib/pos-sales-credit-payment-channel-aggregate'
import {
  aggregateCreditFromSettlements,
  aggregateDeliveryFromSettlements,
  bucketToChannelRows,
  storesWithSettlementCreditBreakdown,
  storesWithSettlementDeliveryBreakdown,
  type PosSettlementBreakdownRow,
} from '@/lib/pos-sales-settlement-breakdown-aggregate'
import {
  buildLinkposTenderHaystack,
  resolveLinkposTender,
  type LinkposTenderRule,
} from '@/lib/linkpos-tender-classify'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { posSalesBusinessDateRangeUtcEnvelope } from '@/lib/pos-sales-business-day-range'
import { loadPosBusinessDaySettingsContext } from '@/lib/pos-business-day-server'
import { expandSalesStoreCodesForFilterAsync } from '@/lib/pos-sales-store-filter'
import { tryFetchPosSalesAnalyticsAgg } from '@/lib/pos-sales-analytics-rpc-server'

function normalizeToken(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, '')
}

async function loadLinkposTenderRules(): Promise<{
  shared: LinkposTenderRule[]
  byStore: Map<string, LinkposTenderRule[]>
}> {
  const shared: LinkposTenderRule[] = []
  const byStore = new Map<string, LinkposTenderRule[]>()
  try {
    const rows = (await supabaseSelectFilter('pos_linkpos_tender_rules', '', {
      limit: 5000,
      select: 'store_code,keyword,group,key,priority',
    })) as {
      store_code?: string | null
      keyword?: string
      group?: string
      key?: string
      priority?: number
    }[] | null
    for (const r of rows || []) {
      const group = String(r.group ?? '').trim().toLowerCase()
      if (group !== 'card' && group !== 'qr') continue
      const rule: LinkposTenderRule = {
        storeCode: String(r.store_code ?? '').trim(),
        keyword: normalizeToken(String(r.keyword ?? '')),
        group,
        key: String(r.key ?? '').trim() || 'Other',
        priority: Number(r.priority) || 0,
      }
      if (!rule.keyword) continue
      if (rule.storeCode) {
        const sk = normalizeToken(rule.storeCode)
        const list = byStore.get(sk) || []
        list.push(rule)
        byStore.set(sk, list)
      } else {
        shared.push(rule)
      }
    }
    shared.sort((a, b) => b.priority - a.priority)
    for (const [k, list] of byStore.entries()) {
      byStore.set(
        k,
        [...list].sort((a, b) => b.priority - a.priority)
      )
    }
  } catch {
    /* table optional */
  }
  return { shared, byStore }
}

async function fetchSettlementsInRange(
  startStr: string,
  endStr: string,
  expandedStoreCodes: string[]
): Promise<PosSettlementBreakdownRow[]> {
  const filter = [
    `settle_date=gte.${encodeURIComponent(startStr.slice(0, 10))}`,
    `settle_date=lte.${encodeURIComponent(endStr.slice(0, 10))}`,
  ].join('&')
  const rows = (await supabaseSelectFilter('pos_settlements', filter, {
    limit: 10000,
    select:
      'store_code,settle_date,cash_amt,card_amt,card_breakdown,qr_amt,qr_breakdown,other_amt,other_breakdown,delivery_app_amt,delivery_app_breakdown',
  })) as PosSettlementBreakdownRow[] | null

  const storeSet =
    expandedStoreCodes.length > 0
      ? new Set(expandedStoreCodes.map((s) => String(s).trim().toLowerCase()))
      : null

  return (rows || []).filter((r) => {
    if (!storeSet || storeSet.size === 0) return true
    return storeSet.has(String(r.store_code ?? '').trim().toLowerCase())
  })
}

function aggregateLinkposForStores(
  attempts: Array<{
    approved_amount?: number
    request_amount?: number
    response_text?: string
    response_raw?: string
    bank_id?: string
    pos_orders?: { store_code?: string } | { store_code?: string }[] | null
  }> | null,
  opts: {
    includeStore?: Set<string> | null
    excludeStoresWithSettlement?: Set<string>
  },
  sharedRules: LinkposTenderRule[],
  storeRulesMap: Map<string, LinkposTenderRule[]>
): Record<string, number> {
  const bucket: Record<string, number> = {}
  const exclude = opts.excludeStoresWithSettlement ?? new Set<string>()
  for (const a of attempts || []) {
    const orderRef = Array.isArray(a.pos_orders) ? a.pos_orders[0] : a.pos_orders
    const storeCode = String(orderRef?.store_code ?? '').trim()
    const storeKey = storeCode.toLowerCase()
    if (!storeKey) continue
    if (exclude.has(storeKey)) continue
    if (opts.includeStore && opts.includeStore.size > 0 && !opts.includeStore.has(storeKey)) continue
    const amount = Number(a.approved_amount ?? a.request_amount ?? 0)
    if (!(amount > 0.005)) continue
    const haystack = buildLinkposTenderHaystack(
      String(a.response_text ?? ''),
      String(a.response_raw ?? ''),
      String(a.bank_id ?? '')
    )
    const tender = resolveLinkposTender(haystack, storeCode, sharedRules, storeRulesMap)
    const key = tender.key.replace(/\s+/g, '_').toLowerCase()
    bucket[key] = (bucket[key] || 0) + amount
  }
  return bucket
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
    const orderTypesAllowed = parseOrderTypesParam(searchParams.get('orderTypes'))

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const expanded = await expandSalesStoreCodesForFilterAsync(stores)
    const storeSet =
      expanded.length > 0 ? new Set(expanded.map((s) => String(s).trim().toLowerCase())) : null

    const settlements = await fetchSettlementsInRange(startStr, endStr, expanded)
    const creditFromSettlement = aggregateCreditFromSettlements(settlements)
    const deliveryFromSettlement = aggregateDeliveryFromSettlements(settlements)
    const storesWithCreditSettlement = storesWithSettlementCreditBreakdown(settlements)
    const storesWithDeliverySettlement = storesWithSettlementDeliveryBreakdown(settlements)

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_PAYMENT_ROW_SELECT,
      queryLabel: 'posSalesByPaymentBreakdown',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')

    const paidRows = filterCompletedPosSalesRows(rows, orderTypesAllowed)

    let deliveryByChannel: { channelKey: string; sales: number }[]
    if (Object.keys(deliveryFromSettlement).some((k) => (deliveryFromSettlement[k] ?? 0) > 0.005)) {
      headers.set('X-Pos-Sales-Delivery-Source', 'settlement')
      deliveryByChannel = bucketToChannelRows(deliveryFromSettlement)
    } else {
      const deliveryRpc = await tryFetchPosSalesAnalyticsAgg({
        startStr,
        endStr,
        storeCodes: stores.length > 0 ? stores : undefined,
        orderTypes: orderTypesAllowed,
        aggMode: 'delivery_payment',
      })
      if (deliveryRpc && deliveryRpc.length > 0) {
        headers.set('X-Pos-Sales-Delivery-Source', 'rpc')
        deliveryByChannel = deliveryRpc
          .map((r) => ({
            channelKey: String(r.bucket_key ?? '').trim(),
            sales: Number(r.total ?? 0) || 0,
          }))
          .filter((r) => r.channelKey && r.sales > 0.005)
          .sort((a, b) => b.sales - a.sales)
      } else {
        headers.set('X-Pos-Sales-Delivery-Source', 'fetch')
        deliveryByChannel = aggregateDeliveryPaymentChannelSales(paidRows)
      }
    }

    // 매장별: 결산 없는 매장만 주문 기반 배달 보조 (결산 매장과 합산)
    if (storesWithDeliverySettlement.size > 0 && storeSet && storeSet.size > 0) {
      const orderDeliveryOnly = paidRows.filter((r) => {
        const sc = String((r as { store_code?: string }).store_code ?? '')
          .trim()
          .toLowerCase()
        return sc && !storesWithDeliverySettlement.has(sc)
      })
      if (orderDeliveryOnly.length > 0) {
        const extra = aggregateDeliveryPaymentChannelSales(orderDeliveryOnly)
        const merged: Record<string, number> = { ...deliveryFromSettlement }
        for (const row of extra) {
          merged[row.channelKey] = (merged[row.channelKey] || 0) + row.sales
        }
        deliveryByChannel = bucketToChannelRows(merged)
        headers.set('X-Pos-Sales-Delivery-Source', 'settlement+orders')
      }
    }

    const bizCtx = await loadPosBusinessDaySettingsContext()
    const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(bizCtx, startStr, endStr)
    const attemptFilter = [
      `created_at=gte.${encodeURIComponent(startISO)}`,
      `created_at=lt.${encodeURIComponent(endISOExclusive)}`,
      'response_code=eq.00',
      'tx_code=eq.20',
    ].join('&')

    const attempts = (await supabaseSelectFilter('pos_payment_attempts', attemptFilter, {
      limit: 50000,
      select:
        'approved_amount,request_amount,response_text,response_raw,bank_id,pos_orders(store_code)',
    })) as {
      approved_amount?: number
      request_amount?: number
      response_text?: string
      response_raw?: string
      bank_id?: string
      pos_orders?: { store_code?: string } | { store_code?: string }[] | null
    }[] | null

    const { shared: sharedRules, byStore: storeRulesMap } = await loadLinkposTenderRules()

    let creditBucket = { ...creditFromSettlement }
    if (Object.keys(creditFromSettlement).some((k) => (creditFromSettlement[k] ?? 0) > 0.005)) {
      headers.set('X-Pos-Sales-Credit-Source', 'settlement')
    }

    const linkposBucket = aggregateLinkposForStores(
      attempts,
      {
        includeStore: storeSet,
        excludeStoresWithSettlement: storesWithCreditSettlement,
      },
      sharedRules,
      storeRulesMap
    )
    if (Object.keys(linkposBucket).length > 0) {
      headers.set('X-Pos-Sales-Linkpos', '1')
      creditBucket = mergeCreditPaymentBuckets(creditBucket, linkposBucket)
      if (!headers.get('X-Pos-Sales-Credit-Source')) {
        headers.set('X-Pos-Sales-Credit-Source', 'linkpos')
      } else if (headers.get('X-Pos-Sales-Credit-Source') === 'settlement') {
        headers.set('X-Pos-Sales-Credit-Source', 'settlement+linkpos')
      }
    }

    const creditByChannel = creditPaymentBucketToRows(creditBucket)

    const summaryRpc = await tryFetchPosSalesAnalyticsAgg({
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      orderTypes: orderTypesAllowed,
      aggMode: 'payment',
    })

    let summary: { paymentKey: string; sales: number }[]
    if (summaryRpc) {
      summary = summaryRpc
        .map((r) => ({
          paymentKey: String(r.payment_key ?? r.bucket_key ?? '').trim(),
          sales: Number(r.total ?? 0) || 0,
        }))
        .filter((r) => r.paymentKey && r.sales > 0)
    } else {
      const byMethod: Record<string, number> = {}
      for (const r of paidRows as Array<Record<string, unknown>>) {
        const cash = Number(r.payment_cash) || 0
        const card = Number(r.payment_card) || 0
        const qr = Number(r.payment_qr) || 0
        const other = Number(r.payment_other) || 0
        const deliveryApp = Number(r.payment_delivery_app) || 0
        if (cash > 0) byMethod.cash = (byMethod.cash || 0) + cash
        if (card > 0) byMethod.card = (byMethod.card || 0) + card
        if (qr > 0) byMethod.qr = (byMethod.qr || 0) + qr
        if (other > 0) byMethod.other = (byMethod.other || 0) + other
        if (deliveryApp > 0) byMethod.delivery_app = (byMethod.delivery_app || 0) + deliveryApp
      }
      summary = Object.entries(byMethod)
        .filter(([, v]) => v > 0)
        .map(([paymentKey, sales]) => ({ paymentKey, sales }))
    }

    return NextResponse.json(
      {
        deliveryByChannel,
        deliveryTotal: sumDeliveryPaymentChannelSales(deliveryByChannel),
        creditByChannel,
        creditTotal: sumCreditPaymentChannelSales(creditByChannel),
        summary: summary.sort((a, b) => b.sales - a.sales),
      },
      { headers }
    )
  } catch (e) {
    console.error('posSalesByPaymentBreakdown:', e)
    return NextResponse.json(
      {
        deliveryByChannel: [],
        deliveryTotal: 0,
        creditByChannel: [],
        creditTotal: 0,
        summary: [],
      },
      { headers }
    )
  }
}
