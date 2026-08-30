import 'server-only'

import { fetchErpStoresMaster, buildStoreListFromEmployees } from '@/lib/erp-store-master'
import { filterPosSalesStoreOptionsForManagement } from '@/lib/pos-sales-test-office'
import { buildStockTakeKpiRows, resolveStockTakeKpiMonth, stockTakeWindowsForYearMonth } from '@/lib/stock-take-kpi'
import { isOfficeStockSelection } from '@/lib/stock-location-patterns'
import { fetchAdjustmentHistoryRows } from '@/lib/stock-logs-history-rpc'
import { storeOpsStoreInScope } from '@/lib/store-ops-alert-utils'
import { supabaseSelect } from '@/lib/supabase-server'

export type StockTakeKpiReport = {
  yearMonth: string
  startYmd: string
  endYmd: string
  windowStart: string
  windowEnd: string
  dueStartYmd: string
  dueEndYmd: string
  inDueWindow: boolean
  totalStores: number
  doneCount: number
  missingCount: number
  stores: {
    store: string
    stockTakeDone: boolean
    adjustmentCount: number
    adjustmentItemCount: number
    lastAdjYmd: string
  }[]
}

export async function loadStockTakeKpiReport(params?: {
  yearMonth?: string
  allowedStores?: string[]
  officeScope?: boolean
}): Promise<StockTakeKpiReport> {
  const ymParam = String(params?.yearMonth || '').trim()
  const month = /^\d{4}-\d{2}$/.test(ymParam)
    ? stockTakeWindowsForYearMonth(ymParam)
    : resolveStockTakeKpiMonth()

  const empList = (await supabaseSelect('employees', {
    order: 'id.asc',
    select: 'store,name,nick,job,role,resign_date,employment_status',
    limit: 5000,
  })) as {
    store?: string
    name?: string
    nick?: string
    job?: string
    role?: string
    resign_date?: string | null
    employment_status?: string | null
  }[]

  const masters = await fetchErpStoresMaster()
  const built = buildStoreListFromEmployees(empList, masters)
  let operationalStores = filterPosSalesStoreOptionsForManagement(built.stores).filter(
    (s) => s && s !== 'All' && !/^cm office$/i.test(s) && !isOfficeStockSelection(s)
  )
  const officeScope = params?.officeScope !== false
  const allowedStores = (params?.allowedStores || []).map((s) => String(s || '').trim()).filter(Boolean)
  if (!officeScope) {
    operationalStores = operationalStores.filter((s) => storeOpsStoreInScope(s, allowedStores, false))
  }

  const adjustments = await fetchAdjustmentHistoryRows({
    startStr: month.windowStartYmd,
    endStr: month.windowEndYmd,
    storeFilter: '',
  })

  const rows = buildStockTakeKpiRows(operationalStores, adjustments)
  const doneCount = rows.filter((r) => r.done).length
  const missingCount = Math.max(0, rows.length - doneCount)

  return {
    yearMonth: month.yearMonth,
    startYmd: month.startYmd,
    endYmd: month.endYmd,
    windowStart: month.windowStartYmd,
    windowEnd: month.windowEndYmd,
    dueStartYmd: month.dueStartYmd,
    dueEndYmd: month.dueEndYmd,
    inDueWindow: month.inDueWindow,
    totalStores: rows.length,
    doneCount,
    missingCount,
    stores: rows.map((r) => ({
      store: r.store,
      stockTakeDone: r.done,
      adjustmentCount: r.adjustmentRows,
      adjustmentItemCount: r.distinctItems,
      lastAdjYmd: r.lastAdjYmd,
    })),
  }
}
