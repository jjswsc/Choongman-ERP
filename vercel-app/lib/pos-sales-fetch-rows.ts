import type { NextRequest } from 'next/server'
import { excludePosSalesTestOfficeRows } from '@/lib/pos-sales-test-office'
import {
  supabaseSelectFilterAllPagesStrippingUnknownColumns,
} from '@/lib/supabase-pgrst204-retry'
import {
  filterRowsByPosSalesBusinessDateRange,
  posSalesBusinessDateRangeUtcEnvelope,
} from '@/lib/pos-sales-business-day-range'
import type { PeriodOrderRow } from '@/lib/pos-sales-period-aggregate'
import {
  loadPosBusinessDaySettingsContext,
  type PosBusinessDaySettingsContext,
} from '@/lib/pos-business-day-server'
import {
  appendStoreCodeFilterFromExpanded,
  expandSalesStoreCodesForFilterAsync,
  rowMatchesAnySalesStoreSelection,
} from '@/lib/pos-sales-store-filter'
import type { SaasTenantScope } from '@/lib/saas-tenant-scope'

/** posSalesByStore·손익·기간 집계 공통 select */
export const POS_SALES_ORDER_ROW_SELECT =
  'created_at,store_code,subtotal,vat,total,discount_amt,coupon_discount_amt,service_amt,guest_count,status,order_type'

export const POS_SALES_MENU_ROW_SELECT = `${POS_SALES_ORDER_ROW_SELECT},items_json`

/** 세트·결제 할인 분석 — promo 줄 + 결제 할인 사유·쿠폰 + 배달앱 플랫폼 식별 */
export const POS_SALES_DISCOUNT_ANALYTICS_ROW_SELECT =
  `${POS_SALES_ORDER_ROW_SELECT},items_json,discount_reason,applied_coupons,coupon_code,delivery_app_code,tier_discount_amt,member_tier_code`

/** 할인 드릴다운 — 주문 식별·표시 필드 */
export const POS_SALES_DISCOUNT_DRILL_ROW_SELECT =
  `${POS_SALES_DISCOUNT_ANALYTICS_ROW_SELECT},id,order_no,table_name,paid_at`

export const POS_SALES_DELIVERY_ROW_SELECT =
  `${POS_SALES_ORDER_ROW_SELECT},delivery_app_code,items_json`

export const POS_SALES_PAYMENT_ROW_SELECT =
  `${POS_SALES_ORDER_ROW_SELECT},id,linkpos_response_code,payment_cash,payment_card,payment_qr,payment_other,payment_other_breakdown,payment_delivery_app,delivery_payment_channel,delivery_app_code,items_json`

/** 단일 select 상한(레거시). 실제 조회는 페이지 반복으로 수집 */
export const POS_SALES_BY_STORE_FETCH_LIMIT = 50_000

/** 매장 지정 시 월간 주문 전량 수집 상한(초과 시 truncated) */
const POS_SALES_FETCH_MAX_ROWS_STORE = 2_000_000
/** 전 매장 조회 상한 */
const POS_SALES_FETCH_MAX_ROWS_ALL = 1_000_000

export type PosSalesFetchedRows = {
  rows: PeriodOrderRow[]
  truncated: boolean
  bizCtx: PosBusinessDaySettingsContext
}

/**
 * @param storeCodes — UI 매장 코드(복수 가능). 비우면 전 매장(본사 전체 조회 시).
 */
export async function fetchPosSalesOrdersForBusinessRange(params: {
  startStr: string
  endStr: string
  storeCodes?: string[]
  /** PostgREST strip-unknown 컨텍스트 라벨 */
  queryLabel?: string
  /** 기본: POS_SALES_ORDER_ROW_SELECT */
  select?: string
  /**
   * true(기본): 본사·오피스 테스트 POS 제외 — 매출 관리·가맹 집계.
   * false: 해당 store_code 주문 포함 — POS 헤더·getPosTodaySales 등.
   */
  excludeTestOfficePos?: boolean
  /** Omni: JWT tenant 스코프 — 없으면 request 로 resolve */
  tenantScope?: SaasTenantScope
  /** tenantScope 미지정 시 Omni JWT 에서 자동 resolve */
  request?: NextRequest
}): Promise<PosSalesFetchedRows> {
  const bizCtx = await loadPosBusinessDaySettingsContext()
  const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(
    bizCtx,
    params.startStr,
    params.endStr
  )
  const expanded =
    params.storeCodes && params.storeCodes.length > 0
      ? await expandSalesStoreCodesForFilterAsync(params.storeCodes)
      : []

  const {
    appendSaasTenantFilter,
    isSaasTenantQueryBlocked,
    isMissingSaasTenantColumnError,
    markSaasTenantColumnMissing,
    resolveSaasTenantScope,
  } = await import('@/lib/saas-tenant-scope')

  let tenantScope = params.tenantScope
  if (!tenantScope && params.request) {
    const { getVerifiedAuth } = await import('@/lib/verify-auth')
    const auth = await getVerifiedAuth(params.request, { skipSaasGate: true })
    tenantScope = await resolveSaasTenantScope({
      auth,
      storeCode: params.storeCodes?.[0] ?? null,
    })
  }
  if (!tenantScope) {
    // 손익·원가 등 request 없는 서버 경로: 매장코드로 테넌트 추론(Omni)
    tenantScope = await resolveSaasTenantScope({
      storeCode: params.storeCodes?.[0] ?? null,
    })
  }

  if (tenantScope && isSaasTenantQueryBlocked(tenantScope, 'pos_orders')) {
    return { rows: [], truncated: false, bizCtx }
  }

  let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
  filter = appendStoreCodeFilterFromExpanded(filter, expanded)
  if (tenantScope) {
    filter = appendSaasTenantFilter(filter, tenantScope, 'pos_orders')
  }

  const maxRows =
    params.storeCodes && params.storeCodes.length > 0
      ? POS_SALES_FETCH_MAX_ROWS_STORE
      : POS_SALES_FETCH_MAX_ROWS_ALL

  let rowsRaw: PeriodOrderRow[]
  try {
    rowsRaw = (await supabaseSelectFilterAllPagesStrippingUnknownColumns(
      'pos_orders',
      filter,
      {
        select: params.select ?? POS_SALES_ORDER_ROW_SELECT,
        order: 'created_at.asc',
        pageSize: 8000,
        maxRows,
      },
      params.queryLabel ?? 'posSalesFetchRows'
    )) as PeriodOrderRow[]
  } catch (err) {
    if (tenantScope?.enforce && isMissingSaasTenantColumnError(err)) {
      markSaasTenantColumnMissing('pos_orders')
      return { rows: [], truncated: false, bizCtx }
    }
    throw err
  }

  const truncated = rowsRaw.length >= maxRows

  let rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, params.startStr, params.endStr)

  if (params.storeCodes && params.storeCodes.length > 0) {
    rows = rows.filter((r) =>
      rowMatchesAnySalesStoreSelection(r.store_code, params.storeCodes!, expanded)
    )
  }

  if (params.excludeTestOfficePos !== false) {
    rows = excludePosSalesTestOfficeRows(rows)
  }

  return {
    rows,
    truncated,
    bizCtx,
  }
}

/** 영업일 필터 이후 매장 UI 코드와 DB store_code 표기(CM 접두·erp 별칭 등) 재매칭 */
export async function applyPosSalesStoreSelectionFilterAsync<
  T extends { store_code?: string | null },
>(rows: T[], storeCodes: string[] | undefined): Promise<T[]> {
  if (!storeCodes?.length) return rows
  const expanded = await expandSalesStoreCodesForFilterAsync(storeCodes)
  return rows.filter((r) => rowMatchesAnySalesStoreSelection(r.store_code, storeCodes, expanded))
}

export function applyPosSalesStoreSelectionFilter<
  T extends { store_code?: string | null },
>(rows: T[], storeCodes: string[] | undefined): T[] {
  if (!storeCodes?.length) return rows
  return rows.filter((r) =>
    storeCodes.some((code) => rowMatchesAnySalesStoreSelection(r.store_code, [code]))
  )
}
