/**
 * get_evaluation_analytics RPC 미배포 시 evaluation_results 행으로 동일 형태 집계
 */

export type EvalAnalyticsSummary = {
  totalEvaluations: number
  uniqueEmployees: number
  avgTotalScore: number | null
}

export type EvalAnalyticsByStore = {
  store: string
  evaluations: number
  uniqueEmployees: number
  avgScore: number | null
}

export type EvalAnalyticsByType = {
  evalType: string
  evaluations: number
  uniqueEmployees: number
  avgScore: number | null
}

export type EvalAnalyticsByMonth = {
  yearMonth: string
  evaluations: number
  avgScore: number | null
}

export type EvalAnalyticsByEvaluator = {
  evaluator: string
  evaluations: number
  avgScore: number | null
}

export type EvalAnalyticsCoverage = {
  activeEmployeesInPeriod: number
  evaluatedEmployees: number
  unevaluatedEmployees: number
  unevaluated: { store: string; name: string; nick: string; job: string }[]
}

export type EvaluationAnalyticsPayload = {
  summary: EvalAnalyticsSummary
  gradeDistribution: Record<string, number>
  byStore: EvalAnalyticsByStore[]
  byType: EvalAnalyticsByType[]
  byMonth: EvalAnalyticsByMonth[]
  byEvaluator: EvalAnalyticsByEvaluator[]
  /** RPC에는 없음 — fallback에서 sections 평균 */
  sectionAverages?: Record<string, number | null>
  source: 'rpc' | 'fallback'
  /** employees 마스터 대비 기간·유형별 미평가 (조회 실패 시 없음) */
  coverage?: EvalAnalyticsCoverage | null
}

const SECTION_KEYS = ['menu', 'cost', 'hygiene', 'attitude', 'manager'] as const

function trimStr(s: unknown): string {
  return String(s ?? '').trim()
}

/** SQL eval_json_total_score 와 동일 규칙 */
export function parseEvalTotalScore(jsonData: unknown): number | null {
  if (jsonData == null) return null
  let obj: Record<string, unknown>
  try {
    if (typeof jsonData === 'string') {
      const t = jsonData.trim()
      if (!t) return null
      obj = JSON.parse(t) as Record<string, unknown>
    } else if (typeof jsonData === 'object') {
      obj = jsonData as Record<string, unknown>
    } else {
      return null
    }
  } catch {
    return null
  }
  const raw = obj.totalScore
  if (raw == null) return null
  const s = String(raw).trim()
  if (!/^-?[0-9]+(\.[0-9]+)?$/.test(s)) return null
  const n = parseFloat(s)
  return Number.isFinite(n) ? n : null
}

function ymFromEvalDate(evalDate: string): string {
  const d = trimStr(evalDate).slice(0, 10)
  if (d.length >= 7) return d.slice(0, 7)
  return ''
}

type RawRow = {
  eval_type?: string
  eval_date?: string
  store_name?: string
  employee_name?: string
  evaluator?: string
  final_grade?: string
  json_data?: string | unknown
}

export function aggregateEvaluationAnalyticsFromRows(rows: RawRow[]): EvaluationAnalyticsPayload {
  const gradeDistribution: Record<string, number> = {}
  const byStoreMap = new Map<
    string,
    { evaluations: number; empSet: Set<string>; scores: number[] }
  >()
  const byTypeMap = new Map<
    string,
    { evaluations: number; empSet: Set<string>; scores: number[] }
  >()
  const byMonthMap = new Map<string, { evaluations: number; scores: number[] }>()
  const byEvalMap = new Map<string, { evaluations: number; scores: number[] }>()
  const allScores: number[] = []
  const empGlobal = new Set<string>()
  const sectionSum: Record<string, { sum: number; n: number }> = {}
  for (const k of SECTION_KEYS) sectionSum[k] = { sum: 0, n: 0 }

  for (const row of rows) {
    const store = trimStr(row.store_name)
    const emp = trimStr(row.employee_name)
    const type = trimStr(row.eval_type).toLowerCase() || 'unknown'
    const evaluator = trimStr(row.evaluator)
    const grade = trimStr(row.final_grade)
    const total = parseEvalTotalScore(row.json_data)
    const ym = ymFromEvalDate(String(row.eval_date || ''))

    if (grade) {
      gradeDistribution[grade] = (gradeDistribution[grade] || 0) + 1
    }
    if (store && emp) {
      empGlobal.add(`${store}\n${emp}`)
    }
    if (total != null) allScores.push(total)

    if (store) {
      if (!byStoreMap.has(store)) {
        byStoreMap.set(store, { evaluations: 0, empSet: new Set(), scores: [] })
      }
      const bs = byStoreMap.get(store)!
      bs.evaluations += 1
      if (emp) bs.empSet.add(emp)
      if (total != null) bs.scores.push(total)
    }

    if (!byTypeMap.has(type)) {
      byTypeMap.set(type, { evaluations: 0, empSet: new Set(), scores: [] })
    }
    const bt = byTypeMap.get(type)!
    bt.evaluations += 1
    if (store && emp) bt.empSet.add(`${store}\n${emp}`)
    if (total != null) bt.scores.push(total)

    if (ym) {
      if (!byMonthMap.has(ym)) byMonthMap.set(ym, { evaluations: 0, scores: [] })
      const bm = byMonthMap.get(ym)!
      bm.evaluations += 1
      if (total != null) bm.scores.push(total)
    }

    if (evaluator) {
      if (!byEvalMap.has(evaluator)) byEvalMap.set(evaluator, { evaluations: 0, scores: [] })
      const be = byEvalMap.get(evaluator)!
      be.evaluations += 1
      if (total != null) be.scores.push(total)
    }

    let parsed: Record<string, unknown> | null = null
    try {
      if (typeof row.json_data === 'string' && row.json_data.trim()) {
        parsed = JSON.parse(row.json_data) as Record<string, unknown>
      } else if (row.json_data && typeof row.json_data === 'object') {
        parsed = row.json_data as Record<string, unknown>
      }
    } catch {
      parsed = null
    }
    const sections = parsed?.sections as Record<string, unknown> | undefined
    if (sections && typeof sections === 'object') {
      for (const key of SECTION_KEYS) {
        const arr = sections[key]
        if (!Array.isArray(arr)) continue
        for (const item of arr) {
          const scoreRaw = (item as { score?: unknown })?.score
          if (scoreRaw == null) continue
          const sv = String(scoreRaw).trim()
          if (!/^-?[0-9]+(\.[0-9]+)?$/.test(sv)) continue
          const sc = parseFloat(sv)
          if (!Number.isFinite(sc)) continue
          sectionSum[key].sum += sc
          sectionSum[key].n += 1
        }
      }
    }
  }

  const avg = (scores: number[]) =>
    scores.length === 0 ? null : Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10000) / 10000

  const byStore: EvalAnalyticsByStore[] = Array.from(byStoreMap.entries())
    .map(([store, v]) => ({
      store,
      evaluations: v.evaluations,
      uniqueEmployees: v.empSet.size,
      avgScore: avg(v.scores),
    }))
    .sort((a, b) => a.store.localeCompare(b.store))

  const byType: EvalAnalyticsByType[] = Array.from(byTypeMap.entries())
    .map(([evalType, v]) => ({
      evalType,
      evaluations: v.evaluations,
      uniqueEmployees: v.empSet.size,
      avgScore: avg(v.scores),
    }))
    .sort((a, b) => a.evalType.localeCompare(b.evalType))

  const byMonth: EvalAnalyticsByMonth[] = Array.from(byMonthMap.entries())
    .map(([yearMonth, v]) => ({
      yearMonth,
      evaluations: v.evaluations,
      avgScore: avg(v.scores),
    }))
    .sort((a, b) => a.yearMonth.localeCompare(b.yearMonth))

  const byEvaluator: EvalAnalyticsByEvaluator[] = Array.from(byEvalMap.entries())
    .map(([evaluator, v]) => ({
      evaluator,
      evaluations: v.evaluations,
      avgScore: avg(v.scores),
    }))
    .sort((a, b) => b.evaluations - a.evaluations)
    .slice(0, 30)

  const sectionAverages: Record<string, number | null> = {}
  for (const key of SECTION_KEYS) {
    const { sum, n } = sectionSum[key]
    sectionAverages[key] = n === 0 ? null : Math.round((sum / n) * 10000) / 10000
  }

  return {
    summary: {
      totalEvaluations: rows.length,
      uniqueEmployees: empGlobal.size,
      avgTotalScore: avg(allScores),
    },
    gradeDistribution,
    byStore,
    byType,
    byMonth,
    byEvaluator,
    sectionAverages,
    source: 'fallback',
  }
}
