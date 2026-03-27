import { supabaseRpc, supabaseSelectFilter } from '@/lib/supabase-server'
import type { JwtPayload } from '@/lib/jwt-auth'
import {
  isAccountingRole,
  isFranchiseeRole,
  isManagerRole,
  isOfficeRole,
} from '@/lib/permissions'
import {
  aggregateEvaluationAnalyticsFromRows,
  type EvaluationAnalyticsPayload,
} from '@/lib/evaluation-analytics-fallback'

export function canViewEvalAnalyticsRole(role: string): boolean {
  if (isOfficeRole(role) || isAccountingRole(role)) return true
  if (isManagerRole(role) || isFranchiseeRole(role)) return true
  return false
}

export function canSummarizeEvalAnalyticsRole(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

function hasWideStoreAccess(role: string): boolean {
  return isOfficeRole(role) || isAccountingRole(role)
}

function unwrapRpcAnalytics(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null
  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw) && 'summary' in raw) {
    return raw as Record<string, unknown>
  }
  if (Array.isArray(raw) && raw.length > 0) {
    const row = raw[0]
    if (row && typeof row === 'object' && !Array.isArray(row)) {
      const o = row as Record<string, unknown>
      if ('summary' in o) return o
      const vals = Object.values(o)
      const first = vals[0]
      if (first && typeof first === 'object' && first !== null && 'summary' in (first as object)) {
        return first as Record<string, unknown>
      }
    }
  }
  return null
}

function numOrNull(v: unknown): number | null {
  if (v == null) return null
  if (typeof v === 'number' && Number.isFinite(v)) return v
  const x = parseFloat(String(v))
  return Number.isFinite(x) ? x : null
}

export function normalizeEvaluationAnalyticsPayload(
  data: Record<string, unknown>,
  source: 'rpc' | 'fallback'
): EvaluationAnalyticsPayload {
  const s = (data.summary || {}) as Record<string, unknown>
  const summary = {
    totalEvaluations: Math.max(0, Math.floor(numOrNull(s.totalEvaluations) ?? 0)),
    uniqueEmployees: Math.max(0, Math.floor(numOrNull(s.uniqueEmployees) ?? 0)),
    avgTotalScore: numOrNull(s.avgTotalScore),
  }
  const gradeDistribution: Record<string, number> = {}
  const gd = data.gradeDistribution
  if (gd && typeof gd === 'object' && !Array.isArray(gd)) {
    for (const [k, v] of Object.entries(gd as Record<string, unknown>)) {
      const n = Math.max(0, Math.floor(numOrNull(v) ?? 0))
      if (n > 0) gradeDistribution[k] = n
    }
  }
  const parseList = <T>(key: string, map: (x: Record<string, unknown>) => T): T[] => {
    const arr = data[key]
    if (!Array.isArray(arr)) return []
    return arr
      .filter((x): x is Record<string, unknown> => x != null && typeof x === 'object' && !Array.isArray(x))
      .map(map)
  }
  const byStore = parseList<EvaluationAnalyticsPayload['byStore'][0]>('byStore', (x) => ({
    store: String(x.store ?? ''),
    evaluations: Math.max(0, Math.floor(numOrNull(x.evaluations) ?? 0)),
    uniqueEmployees: Math.max(0, Math.floor(numOrNull(x.uniqueEmployees) ?? 0)),
    avgScore: numOrNull(x.avgScore),
  }))
  const byType = parseList<EvaluationAnalyticsPayload['byType'][0]>('byType', (x) => ({
    evalType: String(x.evalType ?? ''),
    evaluations: Math.max(0, Math.floor(numOrNull(x.evaluations) ?? 0)),
    uniqueEmployees: Math.max(0, Math.floor(numOrNull(x.uniqueEmployees) ?? 0)),
    avgScore: numOrNull(x.avgScore),
  }))
  const byMonth = parseList<EvaluationAnalyticsPayload['byMonth'][0]>('byMonth', (x) => ({
    yearMonth: String(x.yearMonth ?? ''),
    evaluations: Math.max(0, Math.floor(numOrNull(x.evaluations) ?? 0)),
    avgScore: numOrNull(x.avgScore),
  }))
  const byEvaluator = parseList<EvaluationAnalyticsPayload['byEvaluator'][0]>('byEvaluator', (x) => ({
    evaluator: String(x.evaluator ?? ''),
    evaluations: Math.max(0, Math.floor(numOrNull(x.evaluations) ?? 0)),
    avgScore: numOrNull(x.avgScore),
  }))
  let sectionAverages: Record<string, number | null> | undefined
  const sec = data.sectionAverages
  if (sec && typeof sec === 'object' && !Array.isArray(sec)) {
    sectionAverages = {}
    for (const [k, v] of Object.entries(sec as Record<string, unknown>)) {
      sectionAverages[k] = numOrNull(v)
    }
  }
  return {
    summary,
    gradeDistribution,
    byStore,
    byType,
    byMonth,
    byEvaluator,
    sectionAverages,
    source,
  }
}

async function fetchRowsForFallback(
  evalType: string,
  start: string,
  end: string,
  storeName: string | null
): Promise<Parameters<typeof aggregateEvaluationAnalyticsFromRows>[0]> {
  async function one(typeVal: string) {
    const filters: string[] = [`eval_type=eq.${encodeURIComponent(typeVal)}`]
    if (start) filters.push(`eval_date=gte.${start}`)
    if (end) filters.push(`eval_date=lte.${end}`)
    if (storeName && storeName.trim()) {
      filters.push(`store_name=eq.${encodeURIComponent(storeName.trim())}`)
    }
    const rows = (await supabaseSelectFilter('evaluation_results', filters.join('&'), {
      order: 'eval_date.desc',
      limit: 25000,
    })) as Parameters<typeof aggregateEvaluationAnalyticsFromRows>[0]
    return rows || []
  }
  const t = evalType.toLowerCase()
  if (t === 'all' || t === '') {
    const [a, b] = await Promise.all([one('kitchen'), one('service')])
    return [...a, ...b]
  }
  return one(t === 'service' ? 'service' : 'kitchen')
}

export type LoadEvalAnalyticsParams = {
  start: string
  end: string
  type: string
  storeQuery: string
}

/** JWT 기준 매장 스코프 + 집계 */
export async function loadEvaluationAnalytics(
  auth: JwtPayload,
  params: LoadEvalAnalyticsParams
): Promise<EvaluationAnalyticsPayload> {
  const role = String(auth.role || '')
  const userStore = String(auth.store || '').trim()
  let storeFilter = params.storeQuery.trim() || 'All'

  if ((isManagerRole(role) || isFranchiseeRole(role)) && userStore) {
    storeFilter = userStore
  }

  const startStr = params.start.trim().slice(0, 10)
  const endStr = params.end.trim().slice(0, 10)

  const pStore =
    hasWideStoreAccess(role) && (storeFilter === 'All' || storeFilter === '')
      ? null
      : storeFilter && storeFilter !== 'All'
        ? storeFilter
        : null

  const type = params.type.trim()
  const pType = type.toLowerCase() === 'kitchen' || type.toLowerCase() === 'service' ? type.toLowerCase() : 'all'

  try {
    const raw = await supabaseRpc<unknown>('get_evaluation_analytics', {
      p_start: startStr,
      p_end: endStr,
      p_eval_type: pType,
      p_store_name: pStore,
    })
    const unwrapped = unwrapRpcAnalytics(raw)
    if (unwrapped) {
      return normalizeEvaluationAnalyticsPayload(unwrapped, 'rpc')
    }
  } catch (e) {
    console.warn('get_evaluation_analytics RPC:', e)
  }

  const rows = await fetchRowsForFallback(type, startStr, endStr, pStore)
  return aggregateEvaluationAnalyticsFromRows(rows)
}
