import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
import { bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { fromHex, parseHypercomFrame } from '@/lib/payments/hypercom-v2'

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
  const { searchParams } = new URL(request.url)
  const settleDate = String(searchParams.get('settleDate') || searchParams.get('date') || '').trim()
  const storeCode = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()

  if (!settleDate) {
    return NextResponse.json({ systemTotal: 0, linkpos: null, settlement: null }, { headers })
  }

  try {
    const { startISO, endISOExclusive } = bangkokDateRangeToUtc(settleDate, settleDate)
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
      const rules = (rows || [])
        .map((r) => ({
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
      (storeCode && storeCode !== 'All' ? `&store_code=ilike.${encodeURIComponent(storeCode)}` : '')

    const orders = (await supabaseSelectFilter('pos_orders', orderFilter, {
      limit: 20000,
      select:
        'subtotal,vat,total,status,payment_card,linkpos_response_code,linkpos_requested_amount,linkpos_approved_amount',
    })) as {
      subtotal?: number
      vat?: number
      total?: number
      status?: string
      payment_card?: number
      linkpos_response_code?: string
      linkpos_requested_amount?: number
      linkpos_approved_amount?: number
    }[] | null

    const completedStatuses = ['completed', 'paid', 'ready']
    let systemTotal = 0
    let systemSubtotal = 0
    let systemVat = 0
    let linkposApprovedCount = 0
    let linkposFailedCount = 0
    let linkposRequestedTotal = 0
    let linkposApprovedTotal = 0
    let cardReportedTotal = 0
    for (const o of orders || []) {
      if (!completedStatuses.includes(o.status || '')) continue
      systemTotal += Number(o.total) || 0
      systemSubtotal += Number(o.subtotal) ?? Number(o.total) ?? 0
      systemVat += Number(o.vat) ?? 0
      cardReportedTotal += Number(o.payment_card) || 0
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

    const attemptsFilter = [
      `created_at=gte.${encodeURIComponent(startISO)}`,
      `created_at=lt.${encodeURIComponent(endISOExclusive)}`,
      'tx_code=eq.20',
      'response_code=eq.00',
    ].join('&')
    const attempts = (await supabaseSelectFilter('pos_payment_attempts', attemptsFilter, {
      limit: 20000,
      select:
        'order_id,bank_id,request_amount,approved_amount,response_text,response_raw,response_code,status,pos_orders(store_code)',
    })) as {
      order_id?: number | null
      bank_id?: string
      request_amount?: number
      approved_amount?: number
      response_text?: string
      response_raw?: string
      response_code?: string
      status?: string
      pos_orders?: { store_code?: string } | { store_code?: string }[] | null
    }[] | null

    const autoCardBreakdown: Record<string, number> = {}
    const autoQrBreakdown: Record<string, number> = {}
    for (const a of attempts || []) {
      const orderRef = Array.isArray(a.pos_orders) ? a.pos_orders[0] : a.pos_orders
      const attemptStoreCode = String(orderRef?.store_code ?? '').trim()
      if (storeCode && storeCode !== 'All' && attemptStoreCode !== storeCode) continue
      const amount = Number(a.approved_amount ?? a.request_amount ?? 0)
      if (!(amount > 0)) continue
      const haystack = buildTenderHaystack(
        String(a.response_text ?? ''),
        String(a.response_raw ?? ''),
        String(a.bank_id ?? '')
      )
      const tender = classifyByRules(haystack, attemptStoreCode, sharedRules, storeRulesMap) || classifyLinkposTender(haystack)
      const bucket = tender.group === 'qr' ? autoQrBreakdown : autoCardBreakdown
      bucket[tender.key] = (bucket[tender.key] || 0) + amount
    }

    const storeFilter =
      storeCode && storeCode !== 'All'
        ? `store_code=eq.${encodeURIComponent(storeCode)}&settle_date=eq.${settleDate}`
        : `settle_date=eq.${settleDate}`

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
      memo?: string
      closed?: boolean
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
      memo: String(s.memo ?? ''),
      closed: !!s.closed,
    }))

    return NextResponse.json(
      {
        systemTotal,
        systemSubtotal,
        systemVat,
        linkpos: {
          approvedCount: linkposApprovedCount,
          failedCount: linkposFailedCount,
          requestedTotal: linkposRequestedTotal,
          approvedTotal: linkposApprovedTotal,
          cardReportedTotal,
          diffVsApproved: cardReportedTotal - linkposApprovedTotal,
          autoCardBreakdown,
          autoQrBreakdown,
        },
        settlement: storeCode && storeCode !== 'All' ? list[0] ?? null : list,
      },
      { headers }
    )
  } catch (e) {
    console.error('getPosSettlement:', e)
    return NextResponse.json({ systemTotal: 0, linkpos: null, settlement: null }, { headers })
  }
}
