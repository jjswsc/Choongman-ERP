/**
 * 배달앱 확인 — 배달 순매출 vs 홀/포장 앱결제(GrabPay) + 예상/확정 수수료.
 */
import { NextRequest, NextResponse } from 'next/server'
import { canonicalSalesStoreRowKey, resolveStoresFromParams, rowMatchesSalesStoreSelection } from '@/lib/pos-sales-store-filter'
import {
  resolvePosSalesStoresFromRequest,
  resolvePosSalesTenantScopeFromRequest,
} from '@/lib/pos-sales-request-scope'
import {
  fetchPosSalesOrdersForBusinessRange,
  POS_SALES_PAYMENT_ROW_SELECT,
} from '@/lib/pos-sales-fetch-rows'
import { getPosBusinessDateStrFromConfig } from '@/lib/pos-business-day'
import { resolvePosBusinessHoursFromContext } from '@/lib/pos-business-day-server'
import { applyPosSalesCacheControl } from '@/lib/pos-sales-response-cache'
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
  type DeliveryAppBankDepositInput,
} from '@/lib/pos-delivery-app-bank-deposit'
import {
  fetchDeliveryPlatformSettlementFeePctMap,
  lookupDeliveryPlatformSettlementFeePct,
} from '@/lib/pos-delivery-platform-settlement'
import { supabaseSelectFilterAllPagesStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import {
  appendSaasTenantFilter,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  isMissingSaasTenantColumnError,
} from '@/lib/saas-tenant-scope'

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

type BankTxRow = {
  id?: number
  trans_date?: string
  sales_date?: string | null
  trans_type?: string
  amount?: number
  memo?: string | null
  note?: string | null
  category?: string | null
  store_name?: string | null
  account_subject_id?: number | null
}

async function loadDeliveryAppGlCodeBySubjectId(): Promise<Map<number, string>> {
  const map = new Map<number, string>()
  try {
    const rows = (await supabaseSelectFilter('account_subjects', 'code=in.(4111,4112,4113)', {
      select: 'id,code',
      limit: 50,
    })) as { id?: number; code?: string }[] | null
    for (const r of rows || []) {
      const id = Number(r.id) || 0
      const code = String(r.code || '').trim()
      if (id && code) map.set(id, code)
    }
  } catch {
    /* 계정과목 조회 실패 시 적요만으로 분류 */
  }
  return map
}

function mapBankTxRow(r: BankTxRow, glById: Map<number, string>): DeliveryAppBankDepositInput {
  const sid = Number(r.account_subject_id) || 0
  return {
    transDate: r.trans_date,
    salesDate: r.sales_date,
    transType: r.trans_type,
    amount: r.amount,
    memo: r.memo,
    note: r.note,
    category: r.category,
    storeName: r.store_name,
    accountSubjectCode: sid ? glById.get(sid) || null : null,
  }
}

async function fetchDeliveryAppBankDeposits(params: {
  request: NextRequest
  storeCodes: string[]
  startStr: string
  endStr: string
}): Promise<Map<string, number>> {
  const empty = new Map<string, number>()
  const start = params.startStr.slice(0, 10)
  const end = params.endStr.slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return empty

  const tenantScope = await resolvePosSalesTenantScopeFromRequest(params.request)
  if (isSaasTenantQueryBlocked(tenantScope, 'bank_transactions')) return empty

  const window = bankDepositQueryTransDateWindow(start, end)
  let base = `trans_type=eq.deposit&category=in.(receivable_receive,revenue_delivery)`
  base = appendSaasTenantFilter(base, tenantScope, 'bank_transactions')
  const select = 'id,trans_date,sales_date,trans_type,amount,memo,note,category,store_name,account_subject_id'
  const bySalesDate = `${base}&sales_date=gte.${encodeURIComponent(start)}&sales_date=lte.${encodeURIComponent(end)}`
  const byTransDate = `${base}&trans_date=gte.${encodeURIComponent(window.from)}&trans_date=lte.${encodeURIComponent(window.to)}`

  const load = async (filter: string) =>
    (await supabaseSelectFilterAllPagesStrippingUnknownColumns(
      'bank_transactions',
      filter,
      { select, order: 'id.asc', maxRows: 20_000 },
      'posDeliveryAppReconcile.bankDeposits'
    )) as BankTxRow[]

  try {
    const glById = await loadDeliveryAppGlCodeBySubjectId()
    let rows: BankTxRow[] = []
    try {
      const [a, b] = await Promise.all([load(bySalesDate), load(byTransDate)])
      const seen = new Set<number>()
      for (const r of [...(a || []), ...(b || [])]) {
        const id = Number(r.id) || 0
        if (id && seen.has(id)) continue
        if (id) seen.add(id)
        rows.push(r)
      }
    } catch {
      rows = (await load(byTransDate)) || []
    }
    return aggregateDeliveryAppBankDeposits({
      rows: rows.map((r) => mapBankTxRow(r, glById)),
      startStr: start,
      endStr: end,
      storeCodes: params.storeCodes,
      fallbackStoreCode: params.storeCodes.length === 1 ? params.storeCodes[0] : undefined,
    })
  } catch (e) {
    if (isMissingSaasTenantColumnError(e)) markSaasTenantColumnMissing('bank_transactions')
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

    const { rows, truncated, bizCtx } = await fetchPosSalesOrdersForBusinessRange({
      request,
      startStr,
      endStr,
      storeCodes: stores.length > 0 ? stores : undefined,
      select: POS_SALES_PAYMENT_ROW_SELECT,
      queryLabel: 'posDeliveryAppReconcile',
    })

    if (truncated) headers.set('X-Sales-Truncated', '1')
    headers.set('X-Pos-Sales-Source', 'fetch')

    const aggregated = aggregateDeliveryAppReconcileRows(rows as DeliveryAppReconcileOrderRow[], {
      businessDateForRow: (row) => {
        const raw = String(row.created_at ?? '').trim()
        if (!raw) return ''
        const d = new Date(raw.includes('T') || /[zZ]|[+-]\d{2}:?\d{2}$/.test(raw) ? raw : raw.replace(' ', 'T'))
        if (Number.isNaN(d.getTime())) return String(raw).slice(0, 10)
        const hours = resolvePosBusinessHoursFromContext(bizCtx, String(row.store_code ?? '').trim())
        return getPosBusinessDateStrFromConfig(d, hours)
      },
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
    const remainingBank = new Map(bankMap)
    const withBank = applyBankDepositsToReconcileRows(withSettled, (storeCode, appCode) => {
      const directKey = deliveryAppBankDepositKey(storeCode, appCode)
      const direct = remainingBank.get(directKey)
      if (direct != null) {
        remainingBank.delete(directKey)
        return direct
      }
      for (const [k, v] of remainingBank) {
        const [s, a] = k.split('\t')
        if (a === appCode && rowMatchesSalesStoreSelection(s, storeCode)) {
          remainingBank.delete(k)
          return v
        }
      }
      return null
    })
    const withBankOnly = appendBankOnlyReconcileRows(withBank, remainingBank)

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
