import { supabaseSelect } from "@/lib/supabase-server"
import { getBangkokTodayDateString } from "@/lib/bangkok-time"
import { employeeHeadcountWeight, isEmployedAsOf } from "@/lib/employee-headcount-utils"
import { isOfficeRole } from "@/lib/permissions"
import type { AiScopedAuth } from "@/lib/ai/types"

type StaffingInsight = {
  summary: string
  lines: string[]
  hasData: boolean
}

function normalizeJob(v: unknown): string {
  return String(v || "").trim() || "미분류"
}

export function isStaffingQuestion(query: string): boolean {
  const q = String(query || "").toLowerCase()
  return /(인원|인력|헤드카운트|적정|부족|과다|배치|스케줄|정원|충원)/.test(q)
}

export async function buildStaffingInsight(params: {
  scoped: AiScopedAuth
  requestedStore: string
}): Promise<StaffingInsight> {
  const asOf = getBangkokTodayDateString()
  const requestedStore = String(params.requestedStore || "").trim()
  const scopedStores = new Set<string>()
  if (requestedStore && requestedStore !== "All") scopedStores.add(requestedStore)
  else if (!isOfficeRole(params.scoped.role)) scopedStores.add(params.scoped.store || "All")

  const employees = (await supabaseSelect("employees", {
    order: "id.asc",
    limit: 10000,
    select: "store,job,sal_type,join_date,resign_date",
  }).catch(() => [])) as
    | { store?: string; job?: string; sal_type?: string; join_date?: string; resign_date?: string }[]
    | null

  const targets = (await supabaseSelect("store_job_headcount", {
    order: "store.asc,job.asc",
    limit: 10000,
    select: "store,job,target_count",
  }).catch(() => [])) as
    | { store?: string; job?: string; target_count?: number }[]
    | null

  const activeRows = (employees || []).filter((e) => {
    const st = String(e.store || "").trim()
    if (!st) return false
    if (scopedStores.size > 0 && !scopedStores.has(st)) return false
    return isEmployedAsOf(String(e.join_date || ""), String(e.resign_date || ""), asOf)
  })
  const targetRows = (targets || []).filter((r) => {
    const st = String(r.store || "").trim()
    if (!st) return false
    if (scopedStores.size > 0 && !scopedStores.has(st)) return false
    return true
  })

  if (activeRows.length === 0 && targetRows.length === 0) {
    return {
      summary: "인원 분석 데이터가 없습니다. employees 또는 store_job_headcount 데이터 확인이 필요합니다.",
      lines: [],
      hasData: false,
    }
  }

  const actualByStoreJob = new Map<string, number>()
  for (const e of activeRows) {
    const st = String(e.store || "").trim()
    const job = normalizeJob(e.job)
    const key = `${st}|${job}`
    const prev = actualByStoreJob.get(key) || 0
    actualByStoreJob.set(key, prev + employeeHeadcountWeight(String(e.sal_type || "")))
  }

  const targetByStoreJob = new Map<string, number>()
  for (const t of targetRows) {
    const st = String(t.store || "").trim()
    const job = normalizeJob(t.job)
    const key = `${st}|${job}`
    targetByStoreJob.set(key, Math.max(0, Number(t.target_count || 0)))
  }

  const allKeys = new Set<string>([...actualByStoreJob.keys(), ...targetByStoreJob.keys()])
  const lines: string[] = []
  let totalActual = 0
  let totalTarget = 0
  const byStore = new Map<string, { actual: number; target: number }>()

  for (const key of allKeys) {
    const [store, job] = key.split("|")
    const actual = Number((actualByStoreJob.get(key) || 0).toFixed(1))
    const target = Number((targetByStoreJob.get(key) || 0).toFixed(1))
    const gap = Number((actual - target).toFixed(1))
    totalActual += actual
    totalTarget += target
    const s = byStore.get(store) || { actual: 0, target: 0 }
    s.actual += actual
    s.target += target
    byStore.set(store, s)
    if (Math.abs(gap) >= 0.5) {
      lines.push(`${store} / ${job}: 현재 ${actual}명(FTE), 목표 ${target}명, ${gap > 0 ? `과다 +${gap}` : `부족 ${gap}`}`)
    }
  }

  const storeLines = Array.from(byStore.entries())
    .map(([store, v]) => {
      const actual = Number(v.actual.toFixed(1))
      const target = Number(v.target.toFixed(1))
      const gap = Number((actual - target).toFixed(1))
      return { store, actual, target, gap }
    })
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))

  const summary =
    `기준일 ${asOf} 현재 총 인원 ${Number(totalActual.toFixed(1))}명(FTE), ` +
    `목표 ${Number(totalTarget.toFixed(1))}명, 차이 ${Number((totalActual - totalTarget).toFixed(1))}명 입니다.`

  const topStoreLines = storeLines.slice(0, 5).map((x) =>
    `${x.store}: 현재 ${x.actual} / 목표 ${x.target} (${x.gap >= 0 ? `+${x.gap}` : x.gap})`
  )

  return {
    summary,
    lines: [...topStoreLines, ...lines.slice(0, 8)],
    hasData: true,
  }
}

