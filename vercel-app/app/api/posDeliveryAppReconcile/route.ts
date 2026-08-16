/**
 * 배달앱 확인 — 배달 순매출 vs 홀/포장 앱결제(GrabPay) + 예상/확정 수수료.
 * POS는 방콕 달력일, 통장 4111~4113은 인식일(익일 입금).
 */
import { NextRequest, NextResponse } from 'next/server'
import { canonicalSalesStoreRowKey, resolveStoresFromParams } from '@/lib/pos-sales-store-filter'
import {
  resolvePosSalesStoresFromRequest,
  resolvePosSalesTenantScopeFromRequest,
} from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_PAYMENT_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'
import { channelReconcilePosCalendarDate } from '@/lib/pos-channel-reconcile-match'
import {
  aggregateDeliveryAppReconcileRows,
  applyBankDepositsToReconcileRows,
  applyFeePctToReconcileRows,
  applySettledAmountsToReconcileRows,
  appendBankOnlyReconcileRows,
  buildDeliveryAppReconcileResult,
  type DeliveryAppReconcileFeeSource,
  type DeliveryAppReconcileOrderRow,
} from '@/lib/pos-delivery-app-reconcile'
import {
  aggregateDeliveryAppBankDeposits,
  bankDepositQueryTransDateWindow,
  deliveryAppBankDepositKey,
  emptyDeliveryAppBankDepositAgg,
  type DeliveryAppBankDepositAgg,
} from '@/lib/pos-delivery-app-bank-deposit'
import {
  DELIVERY_APP_BANK_GL_CODES,
  fetchStoreAccountDeposits,
  ledgerRowToBankDepositInput,
} from '@/lib/pos-channel-bank-ledger'
import {
  fetchDeliveryPlatformSettlementFeePctMap,
  lookupDeliveryPlatformSettlementFeePct,
} from '@/lib/pos-delivery-platform-settlement'
import { supabaseSelectFilterAllPagesStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'

export const maxDuration = 60

async function fetchSettledFeeNetByStoreApp(params: {
  storeCodes: string[]
  startStr: string
  endStr: string
}): Promise<Map<string, { fee: number; net: number }>> {
  const map = new Map<string, { fee: number; net: number }>()
  const start = params.startStr.slice(0, 10)
  const end = params.endStr.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return map

  let filter = `settle_date=gte.${encodeURIComponent(start)}&settle_date=lte.${encodeURIComponent(end)}&channel=in.(grab,lineman,shopee)`
  const unique = [...new Set(params.storeCodes.map((s) => String(s || '').trim()).filter(Boolean))]
  if (unique.length > 0) {
    filter += `&store_code=in.(${unique.map((c) => encodeURIComponent(c)).join(',')})`
  }

  try {
    const rows = (await supabaseSelectFilterAllPagesStrippingUnknownColumns(
      'pos_channel_settlements',
      filter,
      {
        select: 'store_code,channel,fee_amt,net_amt',
        order: 'settle_date.asc',
        maxRows: 50_000,
      },
      'posDeliveryAppReconcile.settlements'
    )) as { store_code?: string; channel?: string; fee_amt?: number; net_amt?: number }[]
    for (const r of rows) {
      const store = canonicalSalesStoreRowKey(String(r.store_code ?? '').trim())
      const app = String(r.channel ?? '').trim().toLowerCase()
      if (!store || !app) continue
      const key = `${store}\t${app}`
      const prev = map.get(key) || { fee: 0, net: 0 }
      prev.fee += Number(r.fee_amt) || 0
      prev.net += Number(r.net_amt) || 0
      map.set(key, prev)
    }
  } catch {
    /* 테이블 미배포 시 무시 */
  }
  return map
}

async function fetchDeliveryAppBankDeposits(params: {
  request: NextRequest
  storeCodes: string[]
  startStr: string
  endStr: string
}): Promise<DeliveryAppBankDepositAgg> {
  const empty = emptyDeliveryAppBankDepositAgg()
  const start = params.startStr.slice(0, 10)
  const end = params.endStr.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty

  try {
    const tenantScope = await resolvePosSalesTenantScopeFromRequest(params.request)
    const rows = await fetchStoreAccountDeposits({
      tenantScope,
      storeCodes: params.storeCodes,
      startStr: start,
      endStr: end,
      transDateWindow: bankDepositQueryTransDateWindow(start, end),
      glCodes: [...DELIVERY_APP_BANK_GL_CODES],
      queryLabel: 'posDeliveryAppReconcile.bankDeposits',
    })
    return aggregateDeliveryAppBankDeposits({
      rows: rows.map(ledgerRowToBankDepositInput),
      startStr: start,
      endStr: end,
      storeCodes: params.storeCodes,
    })
  } catch {
    return empty
  }
}

export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  applyPosSalesCacheControl(headers, searchParams)

  try {
    const startStr = searchParams.get('startStr')?.trim()
    const endStr = searchParams.get('endStr')?.trim()
    const pos = searchParams.get('pos')?.trim()
    const stores = await resolvePosSalesStoresFromRequest(
      request,
      resolveStoresFromParams(pos, searchParams.get('stores'))
    )

    if (!startStr || !endStr) {
      return NextResponse.json({ success: false, message: 'startStr, endStr 필요' }, { headers })
    }

    const { rows, truncated } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_PAYMENT_ROW_SELECT,
      queryLabel: 'posDeliveryAppReconcile',
      dateBucket: 'calendar',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const aggregated = aggregateDeliveryAppReconcileRows(rows as DeliveryAppReconcileOrderRow[], {
      businessDateForRow: channelReconcilePosCalendarDate,
    })

    const storeKeys = [...new Set(aggregated.map((r) => r.storeCode))]
    const feeMap = await fetchDeliveryPlatformSettlementFeePctMap(
      stores.length > 0 ? stores : storeKeys
    )

    const withFees = applyFeePctToReconcileRows(aggregated, (storeCode, appCode) => {
      const direct = lookupDeliveryPlatformSettlementFeePct(feeMap, storeCode, appCode)
      if (direct) return { pct: direct.pct, source: 'policy' as DeliveryAppReconcileFeeSource }
      for (const [k, v] of feeMap) {
        const [s, a] = k.split('\t')
        if (a === appCode && canonicalSalesStoreRowKey(s) === storeCode) {
          return { pct: v.pct, source: 'policy' }
        }
      }
      return null
    })

    const settledStoreCodes = stores.length > 0 ? stores : storeKeys
    const [settled, bankMap] = await Promise.all([
      fetchSettledFeeNetByStoreApp({
        storeCodes: settledStoreCodes,
        startStr,
        endStr,
      }),
      fetchDeliveryAppBankDeposits({
        request,
        storeCodes: stores,
        startStr,
        endStr,
      }),
    ])
    const withSettled = applySettledAmountsToReconcileRows(withFees, (storeCode, appCode) => {
      return settled.get(`${storeCode}\t${appCode}`) ?? null
    })
    const remainingBank = new Map(bankMap.byStoreApp)
    const remainingDates = new Map(bankMap.byStoreAppDate)
    const withBank = applyBankDepositsToReconcileRows(
      withSettled,
      (storeCode, appCode) => {
        const directKey = deliveryAppBankDepositKey(storeCode, appCode)
        const direct = remainingBank.get(directKey)
        if (direct != null) {
          remainingBank.delete(directKey)
          return direct
        }
        for (const [k, v] of remainingBank) {
          const [s, a] = k.split('\t')
          if (a === appCode && canonicalSalesStoreRowKey(s) === storeCode) {
            remainingBank.delete(k)
            return v
          }
        }
        return null
      },
      remainingDates
    )
    const withBankOnly = appendBankOnlyReconcileRows(withBank, remainingBank, remainingDates)

    const result = buildDeliveryAppReconcileResult(withBankOnly)
    return NextResponse.json(
      { success: true, ...result, truncated: truncated === true },
      { headers }
    )
  } catch (e) {
    console.error('posDeliveryAppReconcile:', e)
    return NextResponse.json(
      { success: false, message: e instanceof Error ? e.message : String(e) },
      { status: 500, headers }
    )
  }
}
