import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { toDateStrBangkok, bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import {
  loadPosBusinessDaySettingsContext,
  posBusinessDayUtcEnvelopeBangkokYmd,
  type PosBusinessDaySettingsContext,
} from '@/lib/pos-business-day-server'
import {
  filterRowsByPosSalesBusinessDateRange,
  posSalesBusinessDateRangeUtcEnvelope,
} from '@/lib/pos-sales-business-day-range'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { verifyToken } from '@/lib/jwt-auth'
import { isOfficeRole } from '@/lib/permissions'
import { addPosStoreCodeVariants, resolvePosStoreFilterCandidates } from '@/lib/pos-store-filter-candidates'
import { normStoreKey } from '@/lib/store-list-keys'
import { parsePaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import { parseAppliedCouponsFromOrderRow } from '@/lib/pos-coupon-server'
import { supabaseSelectFilterStrippingUnknownColumns, extractAnyMissingColumn } from '@/lib/supabase-pgrst204-retry'
import { POS_ORDER_FULL_SELECT, POS_ORDER_POLL_MINIMAL_SELECT } from '@/lib/pos-order-select'

async function selectPosOrders(
  filter: string,
  opts: { limit?: number; order?: string; select?: string },
  logLabel: string
): Promise<unknown> {
  try {
    return await supabaseSelectFilterStrippingUnknownColumns(
      'pos_orders',
      filter,
      { ...opts, select: opts.select ?? POS_ORDER_SELECT },
      logLabel
    )
  } catch (e) {
    const order = String(opts.order || '')
    const missingCol = extractAnyMissingColumn(e)
    if (missingCol === 'updated_at' && order.includes('updated_at')) {
      return supabaseSelectFilterStrippingUnknownColumns(
        'pos_orders',
        filter,
        { ...opts, order: 'created_at.desc', select: opts.select ?? POS_ORDER_SELECT },
        `${logLabel}/order-fallback`
      )
    }
    throw e
  }
}

async function resolveBearerCaller(
  request: NextRequest
): Promise<{ role: string; store: string } | null> {
  const auth = request.headers.get('authorization') || ''
  const m = auth.match(/^Bearer\s+(\S+)/i)
  if (!m?.[1]) return null
  const payload = await verifyToken(m[1].trim())
  if (!payload) return null
  return {
    role: String(payload.role ?? '').trim(),
    store: String(payload.store ?? '').trim(),
  }
}

const POS_ORDER_SELECT = POS_ORDER_FULL_SELECT

type PosOrderServiceColumnsRow = {
  id?: number
  service_amt?: number
  service_reason?: string
}

/** 메인 select에 service 컬럼이 없거나(PGRST204 strip) 응답에 빠진 행만 보조 조회 */
function orderIdsMissingServiceColumns(
  rows: { id?: number; service_amt?: number; service_reason?: string }[]
): number[] {
  const ids: number[] = []
  for (const r of rows || []) {
    const id = Number(r.id || 0)
    if (id <= 0) continue
    const hasAmt = Object.prototype.hasOwnProperty.call(r, 'service_amt')
    const hasReason = Object.prototype.hasOwnProperty.call(r, 'service_reason')
    if (!hasAmt || !hasReason) ids.push(id)
  }
  return ids
}

async function loadServiceColumnsByOrderId(orderIds: number[]): Promise<Map<number, PosOrderServiceColumnsRow>> {
  const byId = new Map<number, PosOrderServiceColumnsRow>()
  const ids = Array.from(new Set(orderIds.filter((id) => Number.isFinite(id) && id > 0)))
  if (!ids.length) return byId
  const CHUNK = 200
  for (let i = 0; i < ids.length; i += CHUNK) {
    const part = ids.slice(i, i + CHUNK)
    if (!part.length) continue
    const filter = `id=in.(${part.join(',')})`
    const rows = (await supabaseSelectFilter('pos_orders', filter, {
      select: 'id,service_amt,service_reason',
      limit: part.length,
    })) as PosOrderServiceColumnsRow[] | null
    for (const row of rows || []) {
      const id = Number(row.id || 0)
      if (id > 0) byId.set(id, row)
    }
  }
  return byId
}

function inferOrderTypeForResponse(row: {
  order_type?: string
  memo?: string
  table_name?: string
  delivery_payment_channel?: string
  items_json?: string
}) {
  const explicit = coercePosOrderTypeForDb(row.order_type)
  if (explicit !== 'dine_in') return explicit
  const channel = String(row.delivery_payment_channel || '').trim().toLowerCase()
  if (channel === 'grab' || channel === 'lineman' || channel === 'shopee') return 'delivery' as const
  const memo = String(row.memo || '').toLowerCase()
  const tableName = String(row.table_name || '').toLowerCase()
  if (
    memo.includes('grab_order:') ||
    memo.includes('lineman_order:') ||
    memo.includes('shopee_order:') ||
    memo.includes('delivery') ||
    tableName.includes('grab') ||
    tableName.includes('line man') ||
    tableName.includes('lineman') ||
    tableName.includes('shopee')
  ) {
    return 'delivery' as const
  }
  try {
    const items = JSON.parse(String(row.items_json || '[]'))
    if (Array.isArray(items) && items.some((it) => String((it as { deliveryAppCode?: string }).deliveryAppCode || '').trim())) {
      return 'delivery' as const
    }
  } catch {
    // keep dine_in fallback
  }
  return 'dine_in' as const
}

/** POS 주문 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const { searchParams } = new URL(request.url)
  const debugPosOrders =
    searchParams.get('debugPosOrders') === '1' || searchParams.get('debugPosOrders') === 'true'
  const pollMinimal =
    searchParams.get('pollMinimal') === '1' || searchParams.get('pollMinimal') === 'true'
  const orderIdParam = Number(searchParams.get('orderId') || searchParams.get('id') || 0)
  const rowSelect =
    orderIdParam > 0
      ? POS_ORDER_SELECT
      : pollMinimal
        ? POS_ORDER_POLL_MINIMAL_SELECT
        : POS_ORDER_SELECT
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const requestedStore = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const caller = await resolveBearerCaller(request)
  let effectiveStoreCode = requestedStore
  if (caller && !isOfficeRole(caller.role)) {
    const own = caller.store.trim()
    if (own) {
      effectiveStoreCode = own
    } else {
      // 일부 단말에서 JWT payload.store 누락 시 조회 전체가 0건이 되는 장애를 막기 위해
      // 요청 storeCode가 있으면 해당 매장으로 제한 조회를 허용한다.
      effectiveStoreCode = requestedStore
      if (!effectiveStoreCode) {
        return NextResponse.json([], { headers })
      }
      if (process.env.NODE_ENV === 'development' || debugPosOrders) {
        console.log('[getPosOrders] caller store missing, fallback to requestedStore', {
          role: caller.role,
          requestedStore: requestedStore || '(none)',
        })
      }
    }
  }
  const status = String(searchParams.get('status') || '').trim()
  const sinceIdRaw = searchParams.get('sinceId')?.trim()
  const sinceId = sinceIdRaw && /^\d+$/.test(sinceIdRaw) ? parseInt(sinceIdRaw, 10) : null
  const orderIdRaw = searchParams.get('orderId')?.trim()
  const orderId = orderIdRaw && /^\d+$/.test(orderIdRaw) ? parseInt(orderIdRaw, 10) : null
  const statusPaidLike =
    searchParams.get('statusPaidLike') === '1' || searchParams.get('statusPaidLike') === 'true'
  const strictStore =
    searchParams.get('strictStore') === '1' || searchParams.get('strictStore') === 'true'
  const storeFilterCandidates = strictStore
    ? (() => {
        const variants = new Set<string>()
        addPosStoreCodeVariants(variants, effectiveStoreCode)
        return Array.from(variants)
      })()
    : await resolvePosStoreFilterCandidates(effectiveStoreCode)
  const primaryStoreFilter = storeFilterCandidates[0] || ''
  const limitRaw = searchParams.get('limit')?.trim()
  const parsedListLimit = limitRaw && /^\d+$/.test(limitRaw) ? parseInt(limitRaw, 10) : null
  const listLimit =
    parsedListLimit != null ? Math.min(Math.max(parsedListLimit, 1), 2000) : 10000
  const orderByRaw = String(searchParams.get('orderBy') || '').trim().toLowerCase()
  const listOrder: 'created_at.desc' | 'id.desc' | 'updated_at.desc' =
    orderByRaw === 'id.desc'
      ? 'id.desc'
      : orderByRaw === 'updated_at.desc'
        ? 'updated_at.desc'
        : 'created_at.desc'

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
      payment_other_breakdown?: unknown
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
      updated_at?: string
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
    const posBizDayScope =
      searchParams.get('posBizDayScope') === '1' || searchParams.get('posBizDayScope') === 'true'
    let bizDayUtcRange: { startISO: string; endISOExclusive: string } | null = null
    let posBizDayFilterCtx: PosBusinessDaySettingsContext | null = null
    if (posBizDayScope && startDate && endDate) {
      posBizDayFilterCtx = await loadPosBusinessDaySettingsContext()
      bizDayUtcRange =
        startDate === endDate
          ? posBusinessDayUtcEnvelopeBangkokYmd(startDate, posBizDayFilterCtx)
          : posSalesBusinessDateRangeUtcEnvelope(posBizDayFilterCtx, startDate, endDate)
    }

    /** 단건 id 조회: Realtime UPDATE 후 풀 행 보강용 */
    if (orderId != null && orderId > 0) {
      const idFilters = [`id=eq.${orderId}`]
      if (primaryStoreFilter) {
        idFilters.push(`store_code=ilike.${encodeURIComponent(primaryStoreFilter)}`)
      }
      let idRows = (await selectPosOrders(idFilters.join('&'), {
        order: 'created_at.desc',
        limit: 1,
        select: rowSelect,
      }, 'getPosOrders/id')) as typeof rows

      if (!strictStore && !idRows?.length && storeFilterCandidates.length > 1) {
        for (const alt of storeFilterCandidates.slice(1)) {
          const altFilter = `id=eq.${orderId}&store_code=ilike.${encodeURIComponent(alt)}`
          idRows = (await selectPosOrders(altFilter, {
            order: 'created_at.desc',
            limit: 1,
            select: rowSelect,
          }, 'getPosOrders/id-alt')) as typeof rows
          if (idRows?.length) break
        }
      }

      rows = idRows || []
    } else {
      const buildListFilter = (storeForFilter: string) => {
        const parts: string[] = []
        if (startDate && endDate) {
          const { startISO, endISOExclusive } =
            bizDayUtcRange ?? bangkokDateRangeToUtc(startDate, endDate)
          parts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
          parts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
        }
        if (storeForFilter && storeForFilter !== 'All') {
          parts.push(`store_code=ilike.${encodeURIComponent(storeForFilter)}`)
        }
        if (statusPaidLike) {
          parts.push('or=(status.eq.paid,status.eq.completed)')
        } else if (status && status !== 'all') {
          parts.push(`status=eq.${encodeURIComponent(status)}`)
        }
        if (sinceId != null && sinceId > 0) {
          parts.push(`id=gt.${sinceId}`)
        }
        return parts.join('&')
      }

      const filterStr = buildListFilter(primaryStoreFilter)

      if (filterStr) {
        rows = (await selectPosOrders(filterStr, {
          order: listOrder,
          limit: listLimit,
          select: rowSelect,
        }, 'getPosOrders/list')) as typeof rows

        if (!strictStore && storeFilterCandidates.length > 1) {
          const variants = storeFilterCandidates.slice(1)
          if (variants.length > 0) {
            const mergedById = new Map<number, (typeof rows)[number]>()
            for (const row of rows || []) {
              const id = Number(row.id || 0)
              if (id > 0) mergedById.set(id, row)
            }
            for (const alt of variants) {
              const altFilter = buildListFilter(alt)
              const altRows = (await selectPosOrders(altFilter, {
                order: listOrder,
                limit: listLimit,
                select: rowSelect,
              }, 'getPosOrders/list-alt')) as typeof rows
              for (const row of altRows || []) {
                const id = Number(row.id || 0)
                if (id > 0 && !mergedById.has(id)) mergedById.set(id, row)
              }
            }
            rows = Array.from(mergedById.values())
          }
        }
        if (!strictStore && !rows?.length && primaryStoreFilter) {
          const fallbackFilterNoStore = buildListFilter('')
          const fallbackRows = (await selectPosOrders(fallbackFilterNoStore, {
            order: listOrder,
            limit: listLimit,
            select: rowSelect,
          }, 'getPosOrders/list-fallback')) as typeof rows
          const candidateKeys = new Set<string>()
          addPosStoreCodeVariants(candidateKeys, primaryStoreFilter)
          for (const c of storeFilterCandidates) addPosStoreCodeVariants(candidateKeys, c)
          const normCandidateKeys = new Set(
            Array.from(candidateKeys)
              .map((v) => normStoreKey(v))
              .filter(Boolean)
          )
          const normalizedMatchedRows = (fallbackRows || []).filter((r) => {
            const code = String(r.store_code || '').trim()
            if (!code) return false
            const nk = normStoreKey(code)
            return Boolean(nk && normCandidateKeys.has(nk))
          })
          const distinctStoreCodes = Array.from(
            new Set((fallbackRows || []).map((r) => String(r.store_code || '').trim()).filter(Boolean))
          )
          if (normalizedMatchedRows.length > 0) {
            rows = normalizedMatchedRows
            if (process.env.NODE_ENV === 'development' || debugPosOrders) {
              console.log('[getPosOrders] normalized store fallback applied', {
                requestedStore: primaryStoreFilter,
                storeFilterCandidates,
                matchedCount: normalizedMatchedRows.length,
              })
            }
          } else if (distinctStoreCodes.length === 1) {
            rows = fallbackRows || []
            if (process.env.NODE_ENV === 'development' || debugPosOrders) {
              console.log('[getPosOrders] single-store fallback applied', {
                requestedStore: primaryStoreFilter,
                resolvedStoreCode: distinctStoreCodes[0],
                fallbackRowCount: rows.length,
              })
            }
          } else if (process.env.NODE_ENV === 'development' || debugPosOrders) {
            console.log('[getPosOrders] normalized store fallback skipped', {
              requestedStore: primaryStoreFilter,
              storeFilterCandidates,
              normCandidateKeys: Array.from(normCandidateKeys),
              distinctStoreCodes,
            })
          }
        }
      } else {
        rows = (await selectPosOrders('', {
          order: 'created_at.desc',
          limit: 10000,
          select: rowSelect,
        }, 'getPosOrders/list-all')) as typeof rows
      }
    }

    if (process.env.NODE_ENV === 'development' || debugPosOrders) {
      console.log('[getPosOrders]', {
        rowCount: (rows || []).length,
        startDate,
        endDate,
        requestedStore: requestedStore || '(none)',
        effectiveStore: effectiveStoreCode || '(all)',
        primaryStoreFilter: primaryStoreFilter || '(all)',
        storeFilterCandidates,
        strictStore,
        status: statusPaidLike ? 'paidLike' : status || '(all)',
        sinceId: sinceId ?? '(none)',
        listLimit,
        listOrder,
      })
    }

    if (posBizDayFilterCtx && posBizDayScope && startDate && endDate) {
      rows = filterRowsByPosSalesBusinessDateRange(rows || [], posBizDayFilterCtx, startDate, endDate)
    }

    let serviceById = new Map<number, PosOrderServiceColumnsRow>()
    const serviceFetchIds = orderIdsMissingServiceColumns(rows || [])
    if (serviceFetchIds.length > 0) {
      try {
        serviceById = await loadServiceColumnsByOrderId(serviceFetchIds)
      } catch {
        // DB에 service_amt/service_reason 컬럼이 아직 없으면 무시하고 진행
        serviceById = new Map<number, PosOrderServiceColumnsRow>()
      }
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
      .map((r) => {
        const serviceRow = serviceById.get(Number(r.id || 0))
        const rowServiceAmt = (r as { service_amt?: number }).service_amt
        const rowServiceReason = (r as { service_reason?: string }).service_reason
        const paymentOtherBreakdown = parsePaymentOtherBreakdown(r.payment_other_breakdown)
        const dbOrderType = coercePosOrderTypeForDb(r.order_type)
        const inferredOrderType = inferOrderTypeForResponse({
          order_type: r.order_type,
          memo: r.memo,
          table_name: r.table_name,
          delivery_payment_channel: (r as { delivery_payment_channel?: string }).delivery_payment_channel,
          items_json: r.items_json,
        })
        return {
          id: r.id,
          orderNo: String(r.order_no ?? ''),
          storeCode: String(r.store_code ?? ''),
          orderType: inferredOrderType,
          dbOrderType,
          tableName: String(r.table_name ?? ''),
          memo: String(r.memo ?? ''),
          discountAmt: Number(r.discount_amt) ?? 0,
          discountReason: String(r.discount_reason ?? ''),
          serviceAmt: Number(serviceRow?.service_amt ?? rowServiceAmt) || 0,
          serviceReason: String(serviceRow?.service_reason ?? rowServiceReason ?? ''),
          deliveryFee: Number(r.delivery_fee) ?? 0,
          packagingFee: Number(r.packaging_fee) ?? 0,
          cardFeeAmt: Math.max(0, Number((r as { card_fee_amt?: number }).card_fee_amt) || 0),
          cardFeeMode:
            String((r as { card_fee_mode?: string }).card_fee_mode || '').trim() === 'included'
              ? 'included'
              : 'separate',
          cardRate: Math.max(0, Number((r as { card_rate?: number }).card_rate) || 0),
          paymentCash: Number(r.payment_cash) ?? 0,
          ...(Math.max(0, Number((r as { payment_cash_tendered?: number }).payment_cash_tendered) || 0) > 0.005
            ? {
                paymentCashTendered: Math.max(
                  0,
                  Number((r as { payment_cash_tendered?: number }).payment_cash_tendered) || 0
                ),
              }
            : {}),
          paymentCard: Number(r.payment_card) ?? 0,
          paymentQr: Number(r.payment_qr) ?? 0,
          paymentOther: Math.max(0, Number(r.payment_other) || 0),
          ...(paymentOtherBreakdown ? { paymentOtherBreakdown } : {}),
          paymentDeliveryApp: Number((r as { payment_delivery_app?: number }).payment_delivery_app) || 0,
          deliveryAppCode: (() => {
            const c = String((r as { delivery_app_code?: string }).delivery_app_code ?? '').trim()
            return c || undefined
          })(),
          deliveryPaymentChannel: (() => {
            const c = String((r as { delivery_payment_channel?: string }).delivery_payment_channel ?? '').trim()
            return c || undefined
          })(),
          memberId: Number(r.member_id) || 0,
          memberNo: String(r.member_no ?? ''),
          couponCode: String(r.coupon_code ?? ''),
          couponDiscountAmt: Number(r.coupon_discount_amt) ?? 0,
          appliedCoupons: parseAppliedCouponsFromOrderRow(
            (r as { applied_coupons?: unknown }).applied_coupons
          ),
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
          updatedAt: String(r.updated_at ?? ''),
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
        }
      })

    if (process.env.NODE_ENV === 'development' || debugPosOrders) {
      console.log('[getPosOrders] result count:', list.length)
      const sample = (rows || []).slice(0, 20).map((r) => ({
        id: Number(r.id || 0),
        orderNo: String(r.order_no ?? ''),
        storeCode: String(r.store_code ?? ''),
        status: String(r.status ?? ''),
        dbOrderType: String(r.order_type ?? ''),
        inferredOrderType: inferOrderTypeForResponse({
          order_type: r.order_type,
          memo: r.memo,
          table_name: r.table_name,
          delivery_payment_channel: (r as { delivery_payment_channel?: string }).delivery_payment_channel,
          items_json: r.items_json,
        }),
        tableName: String(r.table_name ?? ''),
        memoHead: String(r.memo ?? '').slice(0, 120),
      }))
      console.log('[getPosOrders] debug sample rows:', sample)
      if (list.length === 0 && primaryStoreFilter) {
        try {
          const recentRows = (await supabaseSelectFilter('pos_orders', '', {
            order: 'created_at.desc',
            limit: 50,
            select: 'id,store_code,order_no,order_type,status,created_at,memo',
          })) as {
            id?: number
            store_code?: string
            order_no?: string
            order_type?: string
            status?: string
            created_at?: string
            memo?: string
          }[]
          const recentStoreCodes = Array.from(
            new Set((recentRows || []).map((r) => String(r.store_code || '').trim()).filter(Boolean))
          )
          console.log('[getPosOrders] debug fallback recent store codes:', recentStoreCodes)
          console.log(
            '[getPosOrders] debug fallback recent rows:',
            (recentRows || []).slice(0, 20).map((r) => ({
              id: Number(r.id || 0),
              storeCode: String(r.store_code || ''),
              orderNo: String(r.order_no || ''),
              status: String(r.status || ''),
              orderType: String(r.order_type || ''),
              createdAt: String(r.created_at || ''),
              memoHead: String(r.memo || '').slice(0, 80),
            }))
          )
        } catch (e) {
          console.log('[getPosOrders] debug fallback query failed:', String(e))
        }
      }
    }
    if (pollMinimal && sinceId != null && sinceId > 0 && list.length === 0) {
      headers.set('X-Pos-Orders-Count', '0')
      return new NextResponse(null, { status: 204, headers })
    }
    headers.set('X-Pos-Orders-Count', String(list.length))
    return NextResponse.json(list, { headers })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.error('getPosOrders:', e)
    headers.set('X-Pos-Orders-Error', msg.slice(0, 200))
    return NextResponse.json([], { headers })
  }
}
