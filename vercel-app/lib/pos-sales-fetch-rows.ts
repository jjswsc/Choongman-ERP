/**
 * POS 매출 조회·필터 — posSalesByStore / 손익 매출 / posSalesByPeriod 가 동일한
 * 영업일·매장·완료 상태 기준으로 행을 가져오도록 공용화.
 *
 * **표준 매출액(순매출·가맹 손익 POS)**: 완료 주문 `total` 합. 본사·오피스 store_code 는 테스트 POS →
 * `excludeTestOfficePos`(기본 true)로 매출 관리·집계에서 제외. 본사 손익 매출은 물류 출고 별도.
 * 결제수단별·메뉴별·채널별 API는 breakdown 용도이며, 결제 합 ≠ total 일 수 있음.
 */
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
  appendStoreCodeFilter,
  expandSalesStoreCodesForFilter,
  rowMatchesSalesStoreSelection,
} from '@/lib/pos-sales-store-filter'

/** posSalesByStore·손익·기간 집계 공통 select */
export const POS_SALES_ORDER_ROW_SELECT =
  'created_at,store_code,subtotal,vat,total,discount_amt,coupon_discount_amt,service_amt,guest_count,status,order_type'

/** 단일 select 상한(레거시). 실제 조회는 페이지 반복으로 수집 */
export const POS_SALES_BY_STORE_FETCH_LIMIT = 50_000

/** 매장 지정 시 월간 주문 전량 수집 상한(초과 시 truncated) */
const POS_SALES_FETCH_MAX_ROWS_STORE = 500_000
/** 전 매장 조회 상한 */
const POS_SALES_FETCH_MAX_ROWS_ALL = 200_000

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
}): Promise<PosSalesFetchedRows> {
  const bizCtx = await loadPosBusinessDaySettingsContext()
  const { startISO, endISOExclusive } = posSalesBusinessDateRangeUtcEnvelope(
    bizCtx,
    params.startStr,
    params.endStr
  )
  const expanded =
    params.storeCodes && params.storeCodes.length > 0
      ? expandSalesStoreCodesForFilter(params.storeCodes)
      : []

  let filter = `created_at=gte.${encodeURIComponent(startISO)}&created_at=lt.${encodeURIComponent(endISOExclusive)}`
  filter = appendStoreCodeFilter(filter, expanded.length > 0 ? params.storeCodes! : [])

  const maxRows =
    params.storeCodes && params.storeCodes.length > 0
      ? POS_SALES_FETCH_MAX_ROWS_STORE
      : POS_SALES_FETCH_MAX_ROWS_ALL

  const rowsRaw = (await supabaseSelectFilterAllPagesStrippingUnknownColumns(
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

  const truncated = rowsRaw.length >= maxRows

  let rows = filterRowsByPosSalesBusinessDateRange(rowsRaw, bizCtx, params.startStr, params.endStr)

  if (params.storeCodes && params.storeCodes.length > 0) {
    rows = rows.filter((r) =>
      params.storeCodes!.some((code) => rowMatchesSalesStoreSelection(r.store_code, code))
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

/** 영업일 필터 이후 매장 UI 코드와 DB store_code 표기(CM 접두 등) 재매칭 */
export function applyPosSalesStoreSelectionFilter<
  T extends { store_code?: string | null },
>(rows: T[], storeCodes: string[] | undefined): T[] {
  if (!storeCodes?.length) return rows
  return rows.filter((r) =>
    storeCodes.some((code) => rowMatchesSalesStoreSelection(r.store_code, code))
  )
}
