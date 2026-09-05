import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { supabaseSelectFilterStrippingUnknownColumns } from '@/lib/supabase-pgrst204-retry'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { posBusinessDateYmdToUtcRange } from '@/lib/pos-business-day'
import { loadPosBusinessDayStartForServer } from '@/lib/pos-business-day-server'
import { isPosPaidLikeStatus } from '@/lib/pos-order-policy'
import { fromHex, parseHypercomFrame } from '@/lib/payments/hypercom-v2'
import {
  aggregateOrderPaymentsToSettlementBuckets,
  routeSettlementLineAmount,
} from '@/lib/pos-settlement-auto-breakdown'
import {
  loadPosPaymentMethodCatalog,
  resolvePosPaymentKeysForStore,
} from '@/lib/pos-payment-settings-resolve'
import { resolvePosDeliveryAppSettlementGross } from '@/lib/pos-delivery-app-settlement-amount'
import {
  posDepositCashDrawerDelta,
  shouldExcludeAdvanceFromSalesAggregate,
} from '@/lib/pos-deposit-domain'
import {
  buildSettlementCashReconcile,
} from '@/lib/pos-settlement-sync-after-pay-correct'

type TenderGroup = 'card' | 'qr'
type TenderRule = {
  storeCode: string
  keyword: string
  group: TenderGroup
  key: string
  priority: number
}

function normalizeToken(s: string): string {
  return String(s || '').toLowerCase().replace(/\s+/g, '')
}

const CASH_ACTUAL_DENOM_KEYS = ['1000', '500', '100', '50', '20', '10', '5', '2', '1'] as const

function mapCashActualDenomsFromDb(raw: unknown): Record<string, number> | undefined {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined
  const o = raw as Record<string, unknown>
  const out: Record<string, number> = {}
  let anyNonZero = false
  for (const k of CASH_ACTUAL_DENOM_KEYS) {
    const n = Math.max(0, Math.floor(Number(o[k]) || 0))
    out[k] = n
    if (n > 0) anyNonZero = true
  }
  return anyNonZero ? out : undefined
}

function buildTenderHaystack(responseText: string, responseRawHex: string, bankId: string): string {
  let parsedText = ''
  if (responseRawHex) {
    try {
      const parsed = parseHypercomFrame(fromHex(responseRawHex))
      parsedText = Object.values(parsed.fields || {}).join(' ')
    } catch {
      parsedText = ''
    }
  }
  return normalizeToken(`${responseText} ${parsedText} ${bankId}`)
}

function classifyByRules(
  haystack: string,
  storeCode: string,
  sharedRules: TenderRule[],
  storeRulesMap: Map<string, TenderRule[]>
): { group: TenderGroup; key: string } | null {
  const scoped = storeRulesMap.get(normalizeToken(storeCode)) || []
  const candidates = [...scoped, ...sharedRules]
  for (const r of candidates) {
    if (!r.keyword) continue
    if (haystack.includes(r.keyword)) return { group: r.group, key: r.key }
  }
  return null
}

function classifyLinkposTender(
  haystack: string
): { group: 'card' | 'qr'; key: string } {
  const hay = haystack
  if (/prompt\s*pay|promptpay|thai\s*qr|truemoney|true\s*money|alipay|wechat|qr/.test(hay)) {
    if (/alipay/.test(hay)) return { group: 'qr', key: 'Alipay' }
    if (/wechat/.test(hay)) return { group: 'qr', key: 'WeChat' }
    if (/truemoney|true\s*money/.test(hay)) return { group: 'qr', key: 'TrueMoney' }
    if (/prompt\s*pay|promptpay|thai\s*qr/.test(hay)) return { group: 'qr', key: 'PromptPay' }
    return { group: 'qr', key: 'Other' }
  }
  if (/visa/.test(hay)) return { group: 'card', key: 'Visa' }
  if (/master|mastercard/.test(hay)) return { group: 'card', key: 'Master' }
  if (/jcb/.test(hay)) return { group: 'card', key: 'JCB' }
  if (/amex|american\s*express/.test(hay)) return { group: 'card', key: 'Amex' }
  if (/union\s*pay|unionpay|cup/.test(hay)) return { group: 'card', key: 'UnionPay' }
  return { group: 'card', key: 'Other' }
}

/** POS 결산 데이터 조회 (시스템 매출 + 저장된 결산 입력값) */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  headers.set('Cache-Control', 'no-store, max-age=0')
  const { searchParams } = new URL(request.url)
  const settleDate = String(searchParams.get('settleDate') || searchParams.get('date') || '').trim()

  if (!settleDate) {
    return NextResponse.json(
      {
        systemTotal: 0,
        systemSubtotal: 0,
        systemVat: 0,
        systemCashFromOrders: 0,
        systemCryptoFromOrders: 0,
        tillNetForSettleDate: 0,
        linkpos: null,
        settlement: null,
      },
      { headers }
    )
  }

  try {
    const settleYmd = settleDate.trim().slice(0, 10)
    const rawStore = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
    /** 전 매장·미지정 시 pos_orders 2만 건 등 광역 조회 방지 — 단일 매장만 집계 */
    const hasSingleStore = Boolean(rawStore) && rawStore.toLowerCase() !== 'all'
    if (!hasSingleStore) {
      return NextResponse.json(
        {
          systemTotal: 0,
          systemSubtotal: 0,
          systemVat: 0,
          systemCashFromOrders: 0,
          tillNetForSettleDate: 0,
          linkpos: null,
          settlement: null,
          closeRun: null,
        },
        { headers }
      )
    }
    const storeCode = rawStore

    const bizStart = await loadPosBusinessDayStartForServer(storeCode)
    const { startISO, endISOExclusive } =
      /^\d{4}-\d{2}-\d{2}$/.test(settleYmd)
        ? posBusinessDateYmdToUtcRange(settleYmd, bizStart)
        : bangkokDateRangeToUtc(settleDate, settleDate)
    let sharedRules: TenderRule[] = []
    const storeRulesMap = new Map<string, TenderRule[]>()
    try {
      const rows = (await supabaseSelectFilter('pos_linkpos_tender_rules', 'is_active=eq.true', {
        order: 'priority.asc',
        limit: 5000,
        select: 'store_code,match_keyword,tender_group,tender_key,priority',
      })) as {
        store_code?: string
        match_keyword?: string
        tender_group?: string
        tender_key?: string
        priority?: number
      }[] | null
      const rules: TenderRule[] = (rows || [])
        .map((r): TenderRule => ({
          storeCode: String(r.store_code ?? '__shared__').trim() || '__shared__',
          keyword: normalizeToken(String(r.match_keyword ?? '')),
          group: String(r.tender_group ?? '').trim() === 'qr' ? 'qr' : 'card',
          key: String(r.tender_key ?? '').trim(),
          priority: Number(r.priority ?? 100),
        }))
        .filter((r) => r.keyword && r.key)
        .sort((a, b) => a.priority - b.priority || b.keyword.length - a.keyword.length)
      sharedRules = rules.filter((r) => normalizeToken(r.storeCode) === normalizeToken('__shared__'))
      for (const r of rules) {
        const storeToken = normalizeToken(r.storeCode)
        if (!storeToken || storeToken === normalizeToken('__shared__')) continue
        const arr = storeRulesMap.get(storeToken) || []
        arr.push(r)
        storeRulesMap.set(storeToken, arr)
      }
    } catch (ruleErr) {
      console.error('getPosSettlement linkpos rule fetch:', ruleErr)
    }

    const orderFilter =
      `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}` +
      `&store_code=ilike.${encodeURIComponent(storeCode)}`

    type PosOrderSettlementRow = {
      subtotal?: number
      vat?: number
      total?: number
      discount_amt?: number
      coupon_discount_amt?: number
      status?: string
      order_type?: string
      payment_cash?: number
      payment_card?: number
      payment_qr?: number
      payment_delivery_app?: number
      payment_other?: number
      payment_crypto?: number
      payment_other_breakdown?: unknown
      delivery_payment_channel?: string
      delivery_app_code?: string
      linkpos_response_code?: string
      linkpos_requested_amount?: number
      linkpos_approved_amount?: number
      is_advance?: boolean | null
      scheduled_at?: string | null
    }

    /** Omni 등 pos_orders 컬럼 미배포 시에도 시재(cash_actual)는 반환 — 영업 시작 게이트가 막히지 않게 */
    let orders: PosOrderSettlementRow[] | null = null
    try {
      orders = (await supabaseSelectFilterStrippingUnknownColumns(
        'pos_orders',
        orderFilter,
        {
          limit: 20000,
          select:
            'subtotal,vat,total,status,order_type,discount_amt,coupon_discount_amt,payment_cash,payment_card,payment_qr,payment_delivery_app,payment_other,payment_crypto,payment_other_breakdown,delivery_payment_channel,delivery_app_code,linkpos_response_code,linkpos_requested_amount,linkpos_approved_amount',
        },
        'getPosSettlementOrders'
      )) as PosOrderSettlementRow[] | null
    } catch (orderErr) {
      console.warn('getPosSettlement pos_orders (settlement-only fallback):', orderErr)
      orders = []
    }

    let systemTotal = 0
    let systemSubtotal = 0
    let systemVat = 0
    let systemCashFromOrders = 0
    let systemCryptoFromOrders = 0
    let linkposApprovedCount = 0
    let linkposFailedCount = 0
    let linkposRequestedTotal = 0
    let linkposApprovedTotal = 0
    let cardReportedTotal = 0
    const autoDeliveryAppBreakdown: Record<string, number> = {}
    const autoDineInDeliveryBreakdown: Record<string, number> = {}
    const paymentKeys = await resolvePosPaymentKeysForStore(storeCode)
    const paymentCatalog = await loadPosPaymentMethodCatalog(storeCode)
    const paidOrdersForPayment: typeof orders = []

    const normalizeDeliveryCode = (raw: string): string => {
      const v = String(raw || '').trim().toLowerCase()
      if (!v) return 'Other'
      if (v === 'lineman') return 'Line Man'
      if (v === 'grab') return 'Grab'
      if (v === 'shopee') return 'Shopee'
      return v.replace(/[_-]/g, ' ').replace(/\b\w/g, (m) => m.toUpperCase())
    }

    for (const o of orders || []) {
      if (!isPosPaidLikeStatus(String(o.status ?? ''))) continue
      if (shouldExcludeAdvanceFromSalesAggregate(o)) continue
      paidOrdersForPayment.push(o)
      systemTotal += Number(o.total) || 0
      systemSubtotal += Number(o.subtotal ?? o.total) || 0
      systemVat += Number(o.vat ?? 0) || 0
      systemCashFromOrders += Number(o.payment_cash) || 0
      systemCryptoFromOrders += Number(o.payment_crypto) || 0
      cardReportedTotal += Number(o.payment_card) || 0
      const deliveryAmt = resolvePosDeliveryAppSettlementGross(o)
      if (deliveryAmt > 0) {
        const channel = String(o.delivery_payment_channel || '').trim().toLowerCase()
        const orderType = String(o.order_type || '').trim().toLowerCase()
        /** 테이블 결제에서 배달앱을 쓰면 채널(Grab/LineMan/Shopee)과 무관하게 홀(Dine in) 분류 */
        if (orderType === 'dine_in' || channel === 'dine_in') {
          const dineInChannelKey =
            channel && channel !== 'dine_in' ? normalizeDeliveryCode(channel) : 'DineIn'
          autoDineInDeliveryBreakdown[dineInChannelKey] =
            (autoDineInDeliveryBreakdown[dineInChannelKey] || 0) + deliveryAmt
        } else {
          const key = normalizeDeliveryCode(String(o.delivery_app_code || 'Other'))
          autoDeliveryAppBreakdown[key] = (autoDeliveryAppBreakdown[key] || 0) + deliveryAmt
        }
      }
      const responseCode = String(o.linkpos_response_code ?? '').trim()
      const hasLinkpos = responseCode.length > 0
      if (!hasLinkpos) continue
      linkposRequestedTotal += Number(o.linkpos_requested_amount) || 0
      if (responseCode === '00') {
        linkposApprovedCount += 1
        linkposApprovedTotal += Number(o.linkpos_approved_amount) || 0
      } else {
        linkposFailedCount += 1
      }
    }

    try {
      const ledgerRows = (await supabaseSelectFilterStrippingUnknownColumns(
        'pos_deposit_ledger',
        `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}` +
          `&store_code=ilike.${encodeURIComponent(storeCode)}`,
        { select: 'kind,amount,tender', limit: 20000 },
        'getPosSettlementDepositLedger'
      )) as { kind?: string; amount?: number; tender?: string }[] | null
      systemCashFromOrders += posDepositCashDrawerDelta(ledgerRows || [])
    } catch (ledgerErr) {
      console.warn('getPosSettlement pos_deposit_ledger:', ledgerErr)
    }

    const { autoQrFromOrders: autoQrBreakdownFromOrders, autoOtherFromOrders: autoOtherBreakdown } =
      aggregateOrderPaymentsToSettlementBuckets(
        paidOrdersForPayment,
        paymentKeys.qrKeys,
        paymentKeys.otherKeys,
        paymentCatalog
      )

    const attemptsFilter = [
      `created_at=gte.${encodeURIComponent(startISO)}`,
      `created_at=lt.${encodeURIComponent(endISOExclusive)}`,
      'tx_code=eq.20',
      'response_code=eq.00',
    ].join('&')
    let attempts:
      | {
          order_id?: number | null
          bank_id?: string
          request_amount?: number
          approved_amount?: number
          response_text?: string
          response_raw?: string
          response_code?: string
          status?: string
          pos_orders?: { store_code?: string } | { store_code?: string }[] | null
        }[]
      | null = null
    try {
      attempts = (await supabaseSelectFilter('pos_payment_attempts', attemptsFilter, {
        limit: 20000,
        select:
          'order_id,bank_id,request_amount,approved_amount,response_text,response_raw,response_code,status,pos_orders(store_code)',
      })) as typeof attempts
    } catch (attemptErr) {
      console.warn('getPosSettlement pos_payment_attempts skipped:', attemptErr)
      attempts = []
    }

    const autoCardBreakdown: Record<string, number> = {}
    const autoQrBreakdown: Record<string, number> = {}
    for (const a of attempts || []) {
      const orderRef = Array.isArray(a.pos_orders) ? a.pos_orders[0] : a.pos_orders
      const attemptStoreCode = String(orderRef?.store_code ?? '').trim()
      if (attemptStoreCode !== storeCode) continue
      const amount = Number(a.approved_amount ?? a.request_amount ?? 0)
      if (!(amount > 0)) continue
      const haystack = buildTenderHaystack(
        String(a.response_text ?? ''),
        String(a.response_raw ?? ''),
        String(a.bank_id ?? '')
      )
      const tender = classifyByRules(haystack, attemptStoreCode, sharedRules, storeRulesMap) || classifyLinkposTender(haystack)
      if (tender.group === 'card') {
        autoCardBreakdown[tender.key] = (autoCardBreakdown[tender.key] || 0) + amount
      } else {
        routeSettlementLineAmount(
          tender.key,
          amount,
          paymentKeys.qrKeys,
          paymentKeys.otherKeys,
          autoQrBreakdown,
          autoOtherBreakdown
        )
      }
    }

    // LinkPOS 분류값 + 주문 결제수단(비-LinkPOS 포함) 합산.
    const mergedAutoQrBreakdown: Record<string, number> = { ...autoQrBreakdownFromOrders }
    for (const [k, v] of Object.entries(autoQrBreakdown)) {
      mergedAutoQrBreakdown[k] = (mergedAutoQrBreakdown[k] || 0) + (Number(v) || 0)
    }

    /** 결산일 `trans_date` 기준 입출금(시재)·매출출금 순액 → 마감 예상 돈통에 반영 */
    let tillNetForSettleDate = 0
    if (/^\d{4}-\d{2}-\d{2}$/.test(settleYmd)) {
      try {
        const tillRows = (await supabaseSelectFilter(
          'pos_till_transactions',
          `store_code=eq.${encodeURIComponent(storeCode)}&trans_date=eq.${encodeURIComponent(settleYmd)}`,
          { limit: 5000, select: 'amount' }
        )) as { amount?: number }[] | null
        for (const tr of tillRows || []) {
          tillNetForSettleDate += Number(tr.amount) || 0
        }
      } catch (tillErr) {
        console.warn('getPosSettlement till net:', tillErr)
        tillNetForSettleDate = 0
      }
    }

    const storeFilter = `store_code=eq.${encodeURIComponent(storeCode)}&settle_date=eq.${encodeURIComponent(settleYmd)}`

    const settlements = (await supabaseSelectFilter('pos_settlements', storeFilter, {
      limit: 500,
    })) as {
      id?: number
      store_code?: string
      settle_date?: string
      cash_actual?: number
      cash_amt?: number
      card_amt?: number
      card_breakdown?: Record<string, number>
      qr_amt?: number
      qr_breakdown?: Record<string, number>
      delivery_app_amt?: number
      delivery_app_breakdown?: Record<string, number>
      dine_in_delivery_amt?: number
      dine_in_delivery_breakdown?: Record<string, number>
      other_amt?: number
      other_breakdown?: Record<string, number>
      crypto_amt?: number
      memo?: string
      closed?: boolean
      cash_actual_denoms?: Record<string, unknown> | null
    }[] | null

    const list = (settlements || []).map((s) => ({
      id: s.id,
      storeCode: String(s.store_code ?? ''),
      settleDate: String(s.settle_date ?? ''),
      cashActual: s.cash_actual != null ? Number(s.cash_actual) : null,
      cashAmt: Number(s.cash_amt) ?? 0,
      cardAmt: Number(s.card_amt) ?? 0,
      cardBreakdown: (s.card_breakdown && typeof s.card_breakdown === 'object') ? s.card_breakdown : {},
      qrAmt: Number(s.qr_amt) ?? 0,
      qrBreakdown: (s.qr_breakdown && typeof s.qr_breakdown === 'object') ? s.qr_breakdown : {},
      deliveryAppAmt: Number(s.delivery_app_amt) ?? 0,
      deliveryAppBreakdown: (s.delivery_app_breakdown && typeof s.delivery_app_breakdown === 'object') ? s.delivery_app_breakdown : {},
      dineInDeliveryAmt: Number(s.dine_in_delivery_amt) ?? 0,
      dineInDeliveryBreakdown:
        s.dine_in_delivery_breakdown && typeof s.dine_in_delivery_breakdown === 'object'
          ? s.dine_in_delivery_breakdown
          : {},
      otherAmt: Number(s.other_amt) ?? 0,
      otherBreakdown:
        s.other_breakdown && typeof s.other_breakdown === 'object' ? s.other_breakdown : {},
      cryptoAmt: Number(s.crypto_amt) || 0,
      memo: String(s.memo ?? ''),
      closed: !!s.closed,
      cashActualDenoms: mapCashActualDenomsFromDb(s.cash_actual_denoms),
    }))

    const closeRuns = ((await supabaseSelectFilter(
          'pos_close_runs',
          `store_code=eq.${encodeURIComponent(storeCode)}&business_date=eq.${encodeURIComponent(settleYmd)}`,
          {
            limit: 1,
            select: 'id,status,checks_json,totals_json,settlement_ref,posted_journal_entry_id,validated_at,finalized_at',
          }
        ).catch(() => [])) ?? []) as
      | {
          id?: number
          status?: string
          checks_json?: Record<string, unknown> | null
          totals_json?: Record<string, unknown> | null
          settlement_ref?: number | null
          posted_journal_entry_id?: number | null
          validated_at?: string | null
          finalized_at?: string | null
        }[]
      | null
    const closeRun = closeRuns?.[0]

    const settlementRow = list[0] ?? null
    const cashReconcile = buildSettlementCashReconcile({
      liveCash: systemCashFromOrders,
      savedCash: settlementRow?.cashAmt,
      closed: settlementRow?.closed,
    })

    return NextResponse.json(
      {
        systemTotal,
        systemSubtotal,
        systemVat,
        systemCashFromOrders,
        systemCryptoFromOrders,
        tillNetForSettleDate,
        cashReconcile,
        linkpos: {
          approvedCount: linkposApprovedCount,
          failedCount: linkposFailedCount,
          requestedTotal: linkposRequestedTotal,
          approvedTotal: linkposApprovedTotal,
          cardReportedTotal,
          diffVsApproved: cardReportedTotal - linkposApprovedTotal,
          autoCardBreakdown,
          autoQrBreakdown: mergedAutoQrBreakdown,
          autoDeliveryAppBreakdown,
          autoDineInDeliveryBreakdown,
          autoOtherBreakdown,
        },
        settlement: settlementRow,
        closeRun: closeRun
          ? {
              id: Number(closeRun.id || 0),
              status: String(closeRun.status || 'draft'),
              checks: closeRun.checks_json && typeof closeRun.checks_json === 'object' ? closeRun.checks_json : {},
              totals: closeRun.totals_json && typeof closeRun.totals_json === 'object' ? closeRun.totals_json : {},
              settlementRef:
                closeRun.settlement_ref != null && Number.isFinite(Number(closeRun.settlement_ref))
                  ? Number(closeRun.settlement_ref)
                  : null,
              postedJournalEntryId:
                closeRun.posted_journal_entry_id != null && Number.isFinite(Number(closeRun.posted_journal_entry_id))
                  ? Number(closeRun.posted_journal_entry_id)
                  : null,
              validatedAt: closeRun.validated_at || null,
              finalizedAt: closeRun.finalized_at || null,
            }
          : null,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosSettlement:', e)
    return NextResponse.json(
      {
        systemTotal: 0,
        systemSubtotal: 0,
        systemVat: 0,
        systemCashFromOrders: 0,
        systemCryptoFromOrders: 0,
        tillNetForSettleDate: 0,
        linkpos: null,
        settlement: null,
      },
      { headers }
    )
  }
}
