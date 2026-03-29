import {
  getSupabaseDataLimitDiagnostics,
  supabaseCountTable,
  supabaseSelectPageCap,
  SUPABASE_SELECT_ALL_PAGES_DEFAULT_MAX_ROWS,
} from '@/lib/supabase-server'
import generatedRaw from './admin-route-limits.generated.json'

type GeneratedPayload = {
  generatedAt: string
  entryCount: number
  entries: Array<{
    path: string
    line: number
    kind: string
    value: number
    apiLabel: string
  }>
}

const generated = generatedRaw as GeneratedPayload

export type AdminTableUsageRow = {
  table: string
  rowCount: number | null
  error?: string
  capFromPaging: number
  defaultMaxRows: number
  exceedsPagingCap: boolean
  exceedsDefaultMaxRows: boolean
}

/** 코드 추출 한 건 + 실효 값(요청당 cap 반영 등) */
export type AdminRouteLimitResolved = {
  path: string
  line: number
  kind: string
  value: number
  apiLabel: string
  effectiveValue: number | null
  effectiveDisplay: string
}

const TABLES_FOR_USAGE: string[] = [
  'pos_menu_ingredients',
  'pos_menus',
  'pos_menu_options',
  'items',
  'sauces',
  'sauce_ingredients',
  'pos_orders',
  'bank_transactions',
  'employees',
  'stock_logs',
  'petty_cash_transactions',
  'schedules',
  'leave_requests',
  'payroll_records',
  'complaint_logs',
  'vendors',
]

function resolveExtracted(cap: number): AdminRouteLimitResolved[] {
  return generated.entries.map((e) => {
    let effectiveValue: number | null = null
    let effectiveDisplay = '—'
    if (e.kind === 'limit') {
      effectiveValue = Math.min(e.value, cap)
      effectiveDisplay = effectiveValue.toLocaleString()
    } else if (e.kind === 'pageSize') {
      effectiveValue = Math.min(e.value, cap)
      effectiveDisplay = `${effectiveValue.toLocaleString()}/page`
    } else if (e.kind === 'maxRows') {
      effectiveValue = e.value
      effectiveDisplay = e.value.toLocaleString()
    } else if (e.kind === 'maxDurationSec') {
      effectiveValue = e.value
      effectiveDisplay = `${e.value}s`
    }
    return {
      path: e.path,
      line: e.line,
      kind: e.kind,
      value: e.value,
      apiLabel: e.apiLabel,
      effectiveValue,
      effectiveDisplay,
    }
  })
}

export async function buildAdminDataLimitsPayload() {
  const core = getSupabaseDataLimitDiagnostics()
  const cap = core.selectPageCap
  const capFromPaging = cap * core.selectAllPagesMaxPages
  const routeLimits = resolveExtracted(cap)

  const tableUsage: AdminTableUsageRow[] = await Promise.all(
    TABLES_FOR_USAGE.map(async (table) => {
      try {
        const rowCount = await supabaseCountTable(table)
        return {
          table,
          rowCount,
          capFromPaging,
          defaultMaxRows: SUPABASE_SELECT_ALL_PAGES_DEFAULT_MAX_ROWS,
          exceedsPagingCap: rowCount > capFromPaging,
          exceedsDefaultMaxRows: rowCount > SUPABASE_SELECT_ALL_PAGES_DEFAULT_MAX_ROWS,
        }
      } catch (e) {
        return {
          table,
          rowCount: null,
          error: e instanceof Error ? e.message : String(e),
          capFromPaging,
          defaultMaxRows: SUPABASE_SELECT_ALL_PAGES_DEFAULT_MAX_ROWS,
          exceedsPagingCap: false,
          exceedsDefaultMaxRows: false,
        }
      }
    })
  )

  return {
    ...core,
    limitsExtractedAt: generated.generatedAt,
    limitsExtractedCount: generated.entryCount,
    routeLimits,
    tableUsage,
  }
}
