import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelect, supabaseSelectFilter } from '@/lib/supabase-server'
import { toDateStrBangkok, bangkokDateRangeToUtc } from '@/lib/attendance-utils'
import { coercePosOrderTypeForDb } from '@/lib/pos-sales-order-type-filter'
import { verifyToken } from '@/lib/jwt-auth'
import { isOfficeRole } from '@/lib/permissions'
import { buildLegacyToCanonicalMap, fetchErpStoresMaster, type ErpStoreMasterRow } from '@/lib/erp-store-master'
import { normStoreKey } from '@/lib/store-list-keys'
import { expandGrabStoreMapLinkedCodes, parseGrabStoreMap } from '@/lib/grab-store-map-env'

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

const POS_ORDER_SELECT =
  'id,order_no,store_code,order_type,table_name,memo,discount_amt,discount_reason,delivery_fee,packaging_fee,payment_cash,payment_card,payment_qr,payment_other,payment_delivery_app,delivery_payment_channel,member_id,member_no,coupon_code,coupon_discount_amt,point_used,point_earned,guest_count,items_json,subtotal,vat,total,status,created_at,linkpos_provider,linkpos_mode,linkpos_tx_code,linkpos_bank_id,linkpos_response_code,linkpos_approval_code,linkpos_trace_no,linkpos_ref_no,linkpos_terminal_id,linkpos_merchant_id,linkpos_reference1,linkpos_requested_amount,linkpos_approved_amount,linkpos_requested_at,linkpos_responded_at'

function addStoreVariants(set: Set<string>, raw: string) {
  const v = String(raw || '').trim()
  if (!v || v.toLowerCase() === 'all') return
  set.add(v)
  const partnerStripped = v.replace(/^partner\s*store\s*id\s*[-:]\s*/i, '').trim()
  if (partnerStripped && partnerStripped !== v) set.add(partnerStripped)
  const numeric = (partnerStripped || v).match(/\b(\d{3,6})\b/)?.[1] || ''
  if (numeric) set.add(numeric)
  const prefixed = v.startsWith('CM ') ? v.slice(3).trim() : `CM ${v}`.trim()
  if (prefixed && prefixed !== v) set.add(prefixed)
  const noPrefix = v.replace(/^CM\s+/i, '').trim()
  if (noPrefix && noPrefix !== v) set.add(noPrefix)
}

function addMasterRowVariants(
  set: Set<string>,
  row: { store_code?: string; display_name?: string; aliases?: string[] | null }
) {
  addStoreVariants(set, String(row.store_code || ''))
  addStoreVariants(set, String(row.display_name || ''))
  for (const alias of row.aliases || []) {
    addStoreVariants(set, String(alias || ''))
  }
}

type GrabIntegrationRow = {
  grab_merchant_id?: string
  partner_merchant_id?: string
  integration_status?: string
}

async function resolveStoreFilterCandidates(rawStore: string): Promise<string[]> {
  const base = String(rawStore || '').trim()
  if (!base || base.toLowerCase() === 'all') return []
  const variants = new Set<string>()
  addStoreVariants(variants, base)

  let masters: ErpStoreMasterRow[] = []
  try {
    masters = await fetchErpStoresMaster()
    if (masters.length > 0) {
      const legacyToCanonical = buildLegacyToCanonicalMap(masters)
      const canonical = String(legacyToCanonical[normStoreKey(base)] || '').trim()
      if (canonical) addStoreVariants(variants, canonical)
      const baseKey = normStoreKey(base)
      const canonicalKey = normStoreKey(canonical)
      for (const row of masters) {
        const keys = [
          String(row.store_code || '').trim(),
          String(row.display_name || '').trim(),
          ...((row.aliases || []).map((a) => String(a || '').trim())),
        ]
        const matched = keys.some((k) => {
          const nk = normStoreKey(k)
          return Boolean(nk && (nk === baseKey || (canonicalKey && nk === canonicalKey)))
        })
        if (matched) addMasterRowVariants(variants, row)
      }
    }
  } catch {
    // ignore master resolve failure; fall back to raw variants
  }

  let integrationRows: GrabIntegrationRow[] = []
  try {
    integrationRows = (await supabaseSelect('pos_grab_store_integrations', {
      order: 'updated_at.desc',
      limit: 500,
      select: 'grab_merchant_id,partner_merchant_id,integration_status',
    })) as GrabIntegrationRow[]
  } catch {
    integrationRows = []
  }

  const grabMap = parseGrabStoreMap()
  const legacyToCanonical = masters.length ? buildLegacyToCanonicalMap(masters) : {}
  const baseKey = normStoreKey(base)
  const canonical = String(legacyToCanonical[baseKey] || '').trim()
  const canonicalKey = normStoreKey(canonical)

  // ERP store_code 가 파트너 ID와 같고, GRAB_STORE_MAP_JSON 의 merchant→partner 가 연동과 맞으면 Grab 키 후보 추가
  for (const row of integrationRows || []) {
    const status = String(row.integration_status || '').trim().toLowerCase()
    if (status && status !== 'active') continue
    const G = String(row.grab_merchant_id || '').trim()
    const P = String(row.partner_merchant_id || '').trim()
    if (!G || !P) continue
    const mapped = String(grabMap[G] || '').trim()
    if (!mapped || normStoreKey(mapped) !== normStoreKey(P)) continue
    for (const m of masters) {
      const keys = [
        String(m.store_code || '').trim(),
        String(m.display_name || '').trim(),
        ...((m.aliases || []).map((a) => String(a || '').trim())),
      ]
      const matched = keys.some((k) => {
        const nk = normStoreKey(k)
        return Boolean(nk && (nk === baseKey || (canonicalKey && nk === canonicalKey)))
      })
      if (!matched) continue
      const sc = String(m.store_code || '').trim()
      if (normStoreKey(sc) === normStoreKey(P) || normStoreKey(sc) === normStoreKey(mapped)) {
        addStoreVariants(variants, G)
        addStoreVariants(variants, P)
        addStoreVariants(variants, mapped)
        break
      }
    }
  }

  for (let iter = 0; iter < 6; iter++) {
    const size0 = variants.size
    const variantKeys = new Set(Array.from(variants).map((v) => normStoreKey(v)).filter(Boolean))
    for (const row of integrationRows || []) {
      const status = String(row.integration_status || '').trim().toLowerCase()
      if (status && status !== 'active') continue
      const partnerId = String(row.partner_merchant_id || '').trim()
      const partnerKey = normStoreKey(partnerId)
      if (!partnerKey || !variantKeys.has(partnerKey)) continue
      addStoreVariants(variants, partnerId)
      addStoreVariants(variants, String(row.grab_merchant_id || ''))
    }
    for (const x of expandGrabStoreMapLinkedCodes(Array.from(variants))) {
      addStoreVariants(variants, x)
    }
    if (variants.size === size0) break
  }

  return Array.from(variants)
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
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const requestedStore = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const caller = await resolveBearerCaller(request)
  let effectiveStoreCode = requestedStore
  if (caller && !isOfficeRole(caller.role)) {
    const own = caller.store.trim()
    if (!own) {
      return NextResponse.json([], { headers })
    }
    effectiveStoreCode = own
  }
  const storeFilterCandidates = await resolveStoreFilterCandidates(effectiveStoreCode)
  const primaryStoreFilter = storeFilterCandidates[0] || ''
  const status = String(searchParams.get('status') || '').trim()
  const sinceIdRaw = searchParams.get('sinceId')?.trim()
  const sinceId = sinceIdRaw && /^\d+$/.test(sinceIdRaw) ? parseInt(sinceIdRaw, 10) : null
  const orderIdRaw = searchParams.get('orderId')?.trim()
  const orderId = orderIdRaw && /^\d+$/.test(orderIdRaw) ? parseInt(orderIdRaw, 10) : null
  const statusPaidLike =
    searchParams.get('statusPaidLike') === '1' || searchParams.get('statusPaidLike') === 'true'
  const limitRaw = searchParams.get('limit')?.trim()
  const parsedListLimit = limitRaw && /^\d+$/.test(limitRaw) ? parseInt(limitRaw, 10) : null
  const listLimit =
    parsedListLimit != null ? Math.min(Math.max(parsedListLimit, 1), 2000) : 10000
  const orderByRaw = String(searchParams.get('orderBy') || '').trim().toLowerCase()
  const listOrder: 'created_at.desc' | 'id.desc' = orderByRaw === 'id.desc' ? 'id.desc' : 'created_at.desc'

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
      if (primaryStoreFilter) {
        idFilters.push(`store_code=ilike.${encodeURIComponent(primaryStoreFilter)}`)
      }
      let idRows = (await supabaseSelectFilter('pos_orders', idFilters.join('&'), {
        order: 'created_at.desc',
        limit: 1,
        select: POS_ORDER_SELECT,
      })) as typeof rows

      if (!idRows?.length && storeFilterCandidates.length > 1) {
        for (const alt of storeFilterCandidates.slice(1)) {
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
      const buildListFilter = (storeForFilter: string) => {
        const parts: string[] = []
        if (startDate && endDate) {
          const { startISO, endISOExclusive } = bangkokDateRangeToUtc(startDate, endDate)
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
        rows = (await supabaseSelectFilter('pos_orders', filterStr, {
          order: listOrder,
          limit: listLimit,
          select: POS_ORDER_SELECT,
        })) as typeof rows

        if (storeFilterCandidates.length > 1) {
          const variants = storeFilterCandidates.slice(1)
          if (variants.length > 0) {
            const mergedById = new Map<number, (typeof rows)[number]>()
            for (const row of rows || []) {
              const id = Number(row.id || 0)
              if (id > 0) mergedById.set(id, row)
            }
            for (const alt of variants) {
              const altFilter = buildListFilter(alt)
              const altRows = (await supabaseSelectFilter('pos_orders', altFilter, {
                order: listOrder,
                limit: listLimit,
                select: POS_ORDER_SELECT,
              })) as typeof rows
              for (const row of altRows || []) {
                const id = Number(row.id || 0)
                if (id > 0 && !mergedById.has(id)) mergedById.set(id, row)
              }
            }
            rows = Array.from(mergedById.values())
          }
        }
        const hasNonNumericStoreLabel =
          Boolean(primaryStoreFilter) &&
          /[a-zA-Z\u3131-\uD79D]/.test(primaryStoreFilter) &&
          !/^\d+$/.test(primaryStoreFilter.replace(/^CM\s+/i, '').trim())
        if (!rows?.length && hasNonNumericStoreLabel) {
          const fallbackFilterNoStore = buildListFilter('')
          const fallbackRows = (await supabaseSelectFilter('pos_orders', fallbackFilterNoStore, {
            order: listOrder,
            limit: listLimit,
            select: POS_ORDER_SELECT,
          })) as typeof rows
          const distinctStoreCodes = Array.from(
            new Set((fallbackRows || []).map((r) => String(r.store_code || '').trim()).filter(Boolean))
          )
          if (distinctStoreCodes.length === 1) {
            rows = fallbackRows || []
            if (process.env.NODE_ENV === 'development' || debugPosOrders) {
              console.log('[getPosOrders] non-numeric store fallback applied', {
                requestedStore: primaryStoreFilter,
                resolvedStoreCode: distinctStoreCodes[0],
                fallbackRowCount: rows.length,
              })
            }
          } else if (process.env.NODE_ENV === 'development' || debugPosOrders) {
            console.log('[getPosOrders] non-numeric store fallback skipped', {
              requestedStore: primaryStoreFilter,
              distinctStoreCodes,
            })
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

    if (process.env.NODE_ENV === 'development' || debugPosOrders) {
      console.log('[getPosOrders]', {
        rowCount: (rows || []).length,
        startDate,
        endDate,
        requestedStore: requestedStore || '(none)',
        effectiveStore: effectiveStoreCode || '(all)',
        primaryStoreFilter: primaryStoreFilter || '(all)',
        storeFilterCandidates,
        status: statusPaidLike ? 'paidLike' : status || '(all)',
        sinceId: sinceId ?? '(none)',
        listLimit,
        listOrder,
      })
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
    headers.set('X-Pos-Orders-Count', String(list.length))
    return NextResponse.json(list, { headers })
  } catch (e) {
    console.error('getPosOrders:', e)
    return NextResponse.json([], { headers })
  }
}
