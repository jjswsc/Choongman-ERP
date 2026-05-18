import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import { expandSalesStoreCodesForFilter } from '@/lib/pos-sales-store-filter'

const POS_SALES_FETCH_LIMIT = 50000
const COMPLETED_STATUSES = new Set(['completed', 'paid', 'ready'])

export type PosSalesSumResult = {
  total: number
  completedCount: number
  truncated: boolean
  source: 'rpc' | 'select'
}

function shouldFallbackPosSalesRpc(e: unknown): boolean {
  const msg = String(e || '').toLowerCase()
  return (
    msg.includes('get_pos_sales_period_summary') ||
    msg.includes('42883') ||
    msg.includes('42703') ||
    msg.includes('timeout') ||
    msg.includes('supabase rpc failed')
  )
}

/**
 * 손익 매장 매출 — POS 완료 건 total 합계.
 * 우선 `get_pos_sales_period_summary` RPC, 미배포 시 pos_orders select(5만) + 잘림 플래그.
 */
export async function sumCompletedPosSalesTotal(params: {
  startUtcIso: string
  endUtcExclusive: string
  storeFilter: string
}): Promise<PosSalesSumResult> {
  const storeCodes =
    params.storeFilter && params.storeFilter !== 'All'
      ? expandSalesStoreCodesForFilter([params.storeFilter])
      : []

  try {
    const rows = (await supabaseRpc<
      {
        completed_count?: number
        completed_total?: number
      }[]
    >('get_pos_sales_period_summary', {
      p_start_utc: params.startUtcIso,
      p_end_utc_exclusive: params.endUtcExclusive,
      p_store_codes: storeCodes.length > 0 ? storeCodes : null,
    })) as { completed_count?: number; completed_total?: number }[] | null
    const one = rows?.[0]
    if (one) {
      return {
        total: Number(one.completed_total) || 0,
        completedCount: Number(one.completed_count) || 0,
        truncated: false,
        source: 'rpc',
      }
    }
  } catch (e) {
    if (!shouldFallbackPosSalesRpc(e)) throw e
  }

  let filter = `created_at=gte.${encodeURIComponent(params.startUtcIso)}&created_at=lt.${encodeURIComponent(params.endUtcExclusive)}`
  if (storeCodes.length > 0) {
    filter += `&store_code=in.(${storeCodes.map((c) => encodeURIComponent(c)).join(',')})`
  }
  const rows = (await supabaseSelectFilter('pos_orders', filter, {
    select: 'total,status',
    limit: POS_SALES_FETCH_LIMIT,
  })) as { total?: number; status?: string }[] | null

  let total = 0
  let completedCount = 0
  for (const o of rows || []) {
    if (!COMPLETED_STATUSES.has(String(o.status || ''))) continue
    completedCount += 1
    total += Number(o.total) || 0
  }
  return {
    total,
    completedCount,
    truncated: (rows?.length || 0) >= POS_SALES_FETCH_LIMIT,
    source: 'select',
  }
}
