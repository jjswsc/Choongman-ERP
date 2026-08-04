import { NextRequest, NextResponse } from 'next/server'
import { supabaseSelectFilter } from '@/lib/supabase-server'
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
import { coercePosOrderTypeForDb, inferPosOrderTypeFromRow } from '@/lib/pos-sales-order-type-filter'
import { verifyToken } from '@/lib/jwt-auth'
import { verifyBearerWithSaasGate } from '@/lib/saas/bearer-saas-gate'
import { isOfficeRole } from '@/lib/permissions'
import {
  addPosStoreCodeVariants,
  resolveCanonicalPosStoreCode,
  resolvePosStoreFilterCandidates,
} from '@/lib/pos-store-filter-candidates'
import { normStoreKey } from '@/lib/store-list-keys'
import { parsePaymentOtherBreakdown } from '@/lib/pos-payment-other-breakdown'
import { parseAppliedCouponsFromOrderRow } from '@/lib/pos-coupon-server'
import { isMemberPortalPaymentPendingOrder } from '@/lib/member-portal-payment-pending'
import { supabaseSelectFilterStrippingUnknownColumns, extractAnyMissingColumn } from '@/lib/supabase-pgrst204-retry'
import {
  POS_ORDER_FULL_SELECT,
  POS_ORDER_POLL_HEADS_SELECT,
  POS_ORDER_POLL_MINIMAL_SELECT,
} from '@/lib/pos-order-select'
import {
  appendSaasTenantFilter,
  isMissingSaasTenantColumnError,
  isSaasTenantQueryBlocked,
  markSaasTenantColumnMissing,
  resolveSaasTenantScope,
} from '@/lib/saas-tenant-scope'
import { getVerifiedAuth } from '@/lib/verify-auth'

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
  return inferPosOrderTypeFromRow(row)
}

/** 응답 rows 에 promoItems menuName/menuCode 보강이 필요한 menuId 가 하나라도 있으면 true */
function rowsNeedPromoComponentMenuLookup(rows: Array<{ items_json?: string }> | null): boolean {
  for (const r of rows || []) {
    try {
      const arr = JSON.parse(String(r.items_json || '[]'))
      if (!Array.isArray(arr)) continue
      for (const it of arr) {
        const pis = (it as { promoItems?: Array<{ menuId?: unknown; menuName?: unknown; menuCode?: unknown }> })
          .promoItems
        if (!Array.isArray(pis)) continue
        for (const p of pis) {
          const mid = String((p as { menuId?: unknown }).menuId ?? '').trim()
          if (!mid) continue
          const hasName = String((p as { menuName?: unknown }).menuName ?? '').trim().length > 0
          const hasCode = String((p as { menuCode?: unknown }).menuCode ?? '').trim().length > 0
          if (!hasName || !hasCode) return true
        }
      }
    } catch {
      continue
    }
  }
  return false
}

/** 세트/프로모 구성품 promoItems 에 서버 pos_menus 조인으로 menuName·menuCode 를 채운다.
 * 클라이언트 메뉴/프로모 캐시가 낡아도 주방 슬립이 #ID(번호) 대신 이름을 찍도록 보장.
 * (자동인쇄·재인쇄 등 서버 주문 데이터를 쓰는 모든 경로에 공통 적용)
 */
function attachPromoMenuNames(
  items: unknown[],
  menuById: Map<string, { name: string; code: string }>
): unknown[] {
  if (menuById.size === 0 || !Array.isArray(items)) return items
  return items.map((it) => {
    const pis = (it as { promoItems?: unknown }).promoItems
    if (!Array.isArray(pis) || pis.length === 0) return it
    let changed = false
    const enriched = pis.map((p) => {
      const mid = String((p as { menuId?: unknown }).menuId ?? '').trim()
      if (!mid) return p
      const found = menuById.get(mid)
      if (!found) return p
      const cur = p as { menuName?: unknown; menuCode?: unknown }
      const hasName = String(cur.menuName ?? '').trim().length > 0
      const hasCode = String(cur.menuCode ?? '').trim().length > 0
      if (hasName && hasCode) return p
      changed = true
      return {
        ...(p as object),
        ...(hasName || !found.name ? {} : { menuName: found.name }),
        ...(hasCode || !found.code ? {} : { menuCode: found.code }),
      }
    })
    return changed ? { ...(it as object), promoItems: enriched } : it
  })
}

/** 응답 rows 의 promoItems 가 참조하는 구성품 menuId → {name,code} 맵 (없으면 빈 맵) */
async function loadPromoComponentMenuMap(
  rows: Array<{ items_json?: string }> | null
): Promise<Map<string, { name: string; code: string }>> {
  const promoMenuIds = new Set<string>()
  for (const r of rows || []) {
    try {
      const arr = JSON.parse(String(r.items_json || '[]'))
      if (!Array.isArray(arr)) continue
      for (const it of arr) {
        const pis = (it as { promoItems?: Array<{ menuId?: unknown }> }).promoItems
        if (!Array.isArray(pis)) continue
        for (const p of pis) {
          const mid = String((p as { menuId?: unknown }).menuId ?? '').trim()
          if (mid) promoMenuIds.add(mid)
        }
      }
    } catch {
      /* items_json 파싱 실패 무시 */
    }
  }
  const map = new Map<string, { name: string; code: string }>()
  const ids = Array.from(promoMenuIds)
  if (ids.length === 0) return map
  const CHUNK = 200
  try {
    for (let i = 0; i < ids.length; i += CHUNK) {
      const part = ids.slice(i, i + CHUNK)
      if (!part.length) continue
      const filter = `id=in.(${part.join(',')})`
      const menuRows = (await supabaseSelectFilter('pos_menus', filter, {
        select: 'id,code,name',
        limit: part.length,
      })) as { id?: number | string; code?: string; name?: string }[] | null
      for (const m of menuRows || []) {
        const id = String(m.id ?? '').trim()
        if (!id) continue
        map.set(id, { name: String(m.name ?? '').trim(), code: String(m.code ?? '').trim() })
      }
    }
  } catch {
    /* pos_menus 조회 실패 시 보강 생략 (기존 동작 유지) */
  }
  return map
}

/** POS 주문 목록 조회 */
export async function GET(request: NextRequest) {
  const headers = new Headers()
  headers.set('Access-Control-Allow-Origin', '*')
  const saasBlocked = await verifyBearerWithSaasGate(request, '/api/getPosOrders')
  if (saasBlocked.blocked) {
    saasBlocked.blocked.headers.set('Access-Control-Allow-Origin', '*')
    return saasBlocked.blocked
  }
  const { searchParams } = new URL(request.url)
  const debugPosOrders =
    searchParams.get('debugPosOrders') === '1' || searchParams.get('debugPosOrders') === 'true'
  const pollMinimal =
    searchParams.get('pollMinimal') === '1' || searchParams.get('pollMinimal') === 'true'
  const pollHeads =
    searchParams.get('pollHeads') === '1' || searchParams.get('pollHeads') === 'true'
  /** head/minimal 폴링 — 멀티매장 OR·store 없는 fallback 금지 (Omni 교차조회·전송 폭증 방지) */
  const pollLight = pollMinimal || pollHeads
  const orderIdParam = Number(searchParams.get('orderId') || searchParams.get('id') || 0)
  const rowSelect =
    orderIdParam > 0
      ? POS_ORDER_SELECT
      : pollHeads
        ? POS_ORDER_POLL_HEADS_SELECT
        : pollMinimal
          ? POS_ORDER_POLL_MINIMAL_SELECT
          : POS_ORDER_SELECT
  const startStr = String(searchParams.get('startStr') || searchParams.get('start') || '').trim()
  const endStr = String(searchParams.get('endStr') || searchParams.get('end') || '').trim()
  const requestedStore = String(searchParams.get('storeCode') || searchParams.get('store') || '').trim()
  const auth = await getVerifiedAuth(request, { skipSaasGate: true })
  const tenantScope = await resolveSaasTenantScope({
    auth,
    storeCode: requestedStore && requestedStore.toLowerCase() !== 'all' ? requestedStore : null,
  })
  if (isSaasTenantQueryBlocked(tenantScope, 'pos_orders')) {
    return NextResponse.json([], { headers })
  }
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
  if (effectiveStoreCode && effectiveStoreCode.toLowerCase() !== 'all') {
    effectiveStoreCode = await resolveCanonicalPosStoreCode(effectiveStoreCode)
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
  const posBizDayScopeParam =
    searchParams.get('posBizDayScope') === '1' || searchParams.get('posBizDayScope') === 'true'
  const isSingleStoreBizDayList =
    orderId == null &&
    pollLight &&
    posBizDayScopeParam &&
    startStr &&
    endStr &&
    startStr.slice(0, 10) === endStr.slice(0, 10) &&
    Boolean(primaryStoreFilter) &&
    primaryStoreFilter !== 'All'
  /** pollMinimal/heads·단일 매장·단일 영업일 목록만 기본 1000(주문 건). 영수증 등 full select는 10000 유지 */
  const listLimit =
    parsedListLimit != null
      ? Math.min(Math.max(parsedListLimit, 1), 2000)
      : isSingleStoreBizDayList
        ? 1000
        : 10000
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
      paid_at?: string
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
    const posBizDayScope = posBizDayScopeParam
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
      let idRows = (await selectPosOrders(appendSaasTenantFilter(idFilters.join('&'), tenantScope, 'pos_orders'), {
        order: 'created_at.desc',
        limit: 1,
        select: rowSelect,
      }, 'getPosOrders/id')) as typeof rows

      if (!strictStore && !idRows?.length && storeFilterCandidates.length > 1) {
        for (const alt of storeFilterCandidates.slice(1)) {
          const altFilter = appendSaasTenantFilter(
            `id=eq.${orderId}&store_code=ilike.${encodeURIComponent(alt)}`,
            tenantScope,
            'pos_orders',
          )
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
      const buildListFilter = (storeForFilter: string | string[]) => {
        const parts: string[] = []
        if (startDate && endDate) {
          const { startISO, endISOExclusive } =
            bizDayUtcRange ?? bangkokDateRangeToUtc(startDate, endDate)
          parts.push(`created_at=gte.${encodeURIComponent(startISO)}`)
          parts.push(`created_at=lt.${encodeURIComponent(endISOExclusive)}`)
        }
        const stores = Array.isArray(storeForFilter)
          ? storeForFilter.map((s) => String(s || '').trim()).filter((s) => s && s !== 'All')
          : storeForFilter && storeForFilter !== 'All'
            ? [String(storeForFilter).trim()]
            : []
        if (stores.length === 1) {
          parts.push(`store_code=ilike.${encodeURIComponent(stores[0]!)}`)
        } else if (stores.length > 1) {
          /** pollMinimal 등 — 후보 매장코드를 한 번에 OR (순차 N회 조회 제거) */
          const or = stores.map((s) => `store_code.ilike.${encodeURIComponent(s)}`).join(',')
          parts.push(`or=(${or})`)
        }
        if (statusPaidLike) {
          parts.push('or=(status.eq.paid,status.eq.completed)')
        } else if (status && status !== 'all') {
          parts.push(`status=eq.${encodeURIComponent(status)}`)
        }
        if (sinceId != null && sinceId > 0) {
          parts.push(`id=gt.${sinceId}`)
        }
        return appendSaasTenantFilter(parts.join('&'), tenantScope, 'pos_orders')
      }

      const listStoreArg =
        pollLight && !strictStore && storeFilterCandidates.length > 1
          ? storeFilterCandidates
          : primaryStoreFilter
      const filterStr = buildListFilter(listStoreArg)

      if (filterStr) {
        rows = (await selectPosOrders(filterStr, {
          order: listOrder,
          limit: listLimit,
          select: rowSelect,
        }, 'getPosOrders/list')) as typeof rows

        if (
          !pollLight &&
          !strictStore &&
          storeFilterCandidates.length > 1 &&
          !(Array.isArray(listStoreArg) && listStoreArg.length > 1)
        ) {
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
        /** pollLight(테이블 점유·head 폴링)에서는 store 없는 당일 전체 스캔 fallback 금지 — Omni 멀티매장에서 치명적 */
        if (!pollLight && !strictStore && !rows?.length && primaryStoreFilter) {
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
    if (!pollMinimal && !pollHeads) {
      const serviceFetchIds = orderIdsMissingServiceColumns(rows || [])
      if (serviceFetchIds.length > 0) {
        try {
          serviceById = await loadServiceColumnsByOrderId(serviceFetchIds)
        } catch {
          // DB에 service_amt/service_reason 컬럼이 아직 없으면 무시하고 진행
          serviceById = new Map<number, PosOrderServiceColumnsRow>()
        }
      }
    }

    const promoComponentMenuMap = !pollHeads && rowsNeedPromoComponentMenuLookup(rows)
      ? await loadPromoComponentMenuMap(rows as Array<{ items_json?: string }> | null)
      : new Map<string, { name: string; code: string }>()

    const list = (rows || [])
      .filter((r) => {
        if (orderId != null && orderId > 0) return true
        if (
          isMemberPortalPaymentPendingOrder({
            memo: r.memo,
            status: r.status,
            payment_qr: (r as { payment_qr?: number | null }).payment_qr,
            created_by: (r as { created_by?: string | null }).created_by,
          })
        ) {
          return false
        }
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
              return Array.isArray(arr) ? attachPromoMenuNames(arr, promoComponentMenuMap) : []
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
          paidAt: String(r.paid_at ?? ''),
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
    if (pollLight && sinceId != null && sinceId > 0 && list.length === 0) {
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
