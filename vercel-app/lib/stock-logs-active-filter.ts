import { supabaseSelectFilterAllPages } from '@/lib/supabase-server'

/** PostgREST: 소프트삭제 행 제외. is_deleted 컬럼 없으면 호출측에서 필터 없이 재시도. */
export const STOCK_LOGS_ACTIVE_POSTGREST = 'or=(is_deleted.is.false,is_deleted.is.null)'

export function withStockLogsActiveFilter(baseFilter: string): string {
  const base = String(baseFilter || '').trim()
  if (!base) return STOCK_LOGS_ACTIVE_POSTGREST
  return `${base}&${STOCK_LOGS_ACTIVE_POSTGREST}`
}

export function isMissingStockLogsDeletedColumnError(err: unknown): boolean {
  const msg = String(err || '').toLowerCase()
  return msg.includes('is_deleted') || msg.includes('42703')
}

export function sumStockLogItemQty(
  rows: { item_code?: string; qty?: number }[] | null | undefined
): Record<string, number> {
  const m: Record<string, number> = {}
  for (const r of rows || []) {
    const code = String(r.item_code || '').trim()
    if (!code) continue
    m[code] = (m[code] || 0) + Number(r.qty || 0)
  }
  return m
}

export async function fetchStockLogsItemQtySum(
  baseFilter: string,
  options?: { pageSize?: number; maxRows?: number }
): Promise<Record<string, number>> {
  const pageSize = options?.pageSize ?? 8000
  const maxRows = options?.maxRows ?? 1_000_000
  const selectOpts = {
    order: 'id.asc' as const,
    pageSize,
    maxRows,
    select: 'item_code,qty',
  }
  try {
    const rows = (await supabaseSelectFilterAllPages(
      'stock_logs',
      withStockLogsActiveFilter(baseFilter),
      selectOpts
    )) as { item_code?: string; qty?: number }[] | null
    return sumStockLogItemQty(rows)
  } catch (e) {
    if (!isMissingStockLogsDeletedColumnError(e)) throw e
    const rows = (await supabaseSelectFilterAllPages('stock_logs', baseFilter, selectOpts)) as {
      item_code?: string
      qty?: number
    }[] | null
    return sumStockLogItemQty(rows)
  }
}
