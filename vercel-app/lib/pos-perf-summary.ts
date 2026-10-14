/** POS 화면 체감 지연(클릭→버튼 해제) 기록 — 클라이언트 버퍼·서버 로그 공용 */
export interface PosPerfEntry {
  /** 동작 이름 (order_submit, dinein_payment, checker_toggle …) */
  a: string
  /** 소요 ms */
  ms: number
  /** 기록 시각 epoch ms */
  t: number
}

export interface PosPerfActionSummary {
  action: string
  count: number
  p50: number
  p95: number
  max: number
  /** 3초 이상 걸린 횟수 */
  slow: number
}

export const POS_PERF_SLOW_MS = 3000
export const POS_PERF_MAX_ENTRIES_PER_BEACON = 100

const ACTION_RE = /^[a-z0-9_]{1,40}$/

/** 외부 입력(beacon body) 정규화 — 이상값은 버린다 */
export function normalizePosPerfEntries(raw: unknown): PosPerfEntry[] {
  if (!Array.isArray(raw)) return []
  const out: PosPerfEntry[] = []
  for (const row of raw.slice(0, POS_PERF_MAX_ENTRIES_PER_BEACON)) {
    if (!row || typeof row !== 'object') continue
    const r = row as Record<string, unknown>
    const a = String(r.a ?? '').trim()
    const ms = Number(r.ms)
    const t = Number(r.t)
    if (!ACTION_RE.test(a)) continue
    if (!Number.isFinite(ms) || ms < 0 || ms > 10 * 60 * 1000) continue
    out.push({ a, ms: Math.round(ms), t: Number.isFinite(t) ? Math.round(t) : 0 })
  }
  return out
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0
  const idx = Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))
  return sorted[idx]
}

export function summarizePosPerfEntries(entries: PosPerfEntry[]): PosPerfActionSummary[] {
  const byAction = new Map<string, number[]>()
  for (const e of entries) {
    const list = byAction.get(e.a) ?? []
    list.push(e.ms)
    byAction.set(e.a, list)
  }
  return [...byAction]
    .map(([action, list]) => {
      const sorted = [...list].sort((x, y) => x - y)
      return {
        action,
        count: sorted.length,
        p50: percentile(sorted, 50),
        p95: percentile(sorted, 95),
        max: sorted[sorted.length - 1] ?? 0,
        slow: sorted.filter((ms) => ms >= POS_PERF_SLOW_MS).length,
      }
    })
    .sort((x, y) => x.action.localeCompare(y.action))
}
