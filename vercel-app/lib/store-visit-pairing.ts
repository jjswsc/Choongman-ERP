/**
 * store_visits 이벤트 로그 짝짓기.
 * - 시작/종료는 append-only 이므로, 사람별 시간순 스택으로 open 방문 판정.
 * - personExclusive: 새 시작이 오면 이전 open을 그 시각에 암묵 종료 (한 사람·동시 1곳).
 */

import { visitInstantMsBangkok } from '@/lib/attendance-utils'

export const STORE_VISIT_START_TYPES = new Set(['방문시작', '강제 방문시작'])
export const STORE_VISIT_END_TYPES = new Set(['방문종료', '강제 방문종료'])

/** 동일 매장 중복 시작으로 간주하는 창(ms) — 더블탭·오프라인 재전송 */
export const STORE_VISIT_DUPLICATE_START_MS = 3 * 60 * 1000

export type StoreVisitEventRow = {
  visit_date?: string
  visit_time?: string
  name?: string
  store_name?: string
  visit_type?: string
  purpose?: string
  created_at?: string
}

export type StoreVisitOpen = {
  store: string
  purpose: string
  startMs: number
}

export type StoreVisitCompleted = {
  store: string
  purpose: string
  startMs: number
  endMs: number
  /** true = 실제 종료 이벤트 없이 다음 시작으로 닫힘 */
  implicitClose: boolean
}

export type PairVisitEventsOptions = {
  /**
   * true면 사람당 open 최대 1개.
   * 새 시작 시 기존 open을 새 시작 시각에 암묵 종료.
   * 동일 매장·짧은 간격 재시작은 pending에 넣지 않음(중복 무시).
   */
  personExclusive?: boolean
}

function sortEventsAsc(rows: StoreVisitEventRow[]): StoreVisitEventRow[] {
  return [...rows].sort((a, b) => {
    const ma = visitInstantMsBangkok(String(a.visit_date), a.visit_time, a.created_at)
    const mb = visitInstantMsBangkok(String(b.visit_date), b.visit_time, b.created_at)
    if (ma !== mb) return ma - mb
    return String(a.created_at || '').localeCompare(String(b.created_at || ''))
  })
}

/**
 * 한 사람의 이벤트 배열을 완료 구간 + 미종료 open으로 짝짓기.
 * 종료는 같은 store의 pending LIFO. personExclusive면 매장 무관 open 1개.
 */
export function pairVisitEventsForPerson(
  rows: StoreVisitEventRow[],
  options?: PairVisitEventsOptions
): { completed: StoreVisitCompleted[]; open: StoreVisitOpen[] } {
  const personExclusive = options?.personExclusive === true
  const pending: StoreVisitOpen[] = []
  const completed: StoreVisitCompleted[] = []

  for (const row of sortEventsAsc(rows)) {
    const vt = String(row.visit_type || '')
    const store = String(row.store_name || '').trim()
    const purpose = String(row.purpose || '').trim() || '기타'

    if (STORE_VISIT_START_TYPES.has(vt)) {
      const startMs = visitInstantMsBangkok(String(row.visit_date), row.visit_time, row.created_at)

      if (personExclusive && pending.length > 0) {
        const last = pending[pending.length - 1]
        // 동일 매장·짧은 간격 → 더블 제출로 보고 무시
        if (
          last.store === store &&
          startMs - last.startMs >= 0 &&
          startMs - last.startMs <= STORE_VISIT_DUPLICATE_START_MS
        ) {
          continue
        }
        // 이전 open 전부 암묵 종료 후 새 시작
        while (pending.length > 0) {
          const prev = pending.pop()!
          const endMs = Math.max(startMs, prev.startMs)
          completed.push({
            store: prev.store,
            purpose: prev.purpose,
            startMs: prev.startMs,
            endMs,
            implicitClose: true,
          })
        }
      }

      pending.push({ store, purpose, startMs })
      continue
    }

    if (STORE_VISIT_END_TYPES.has(vt)) {
      const endMs = visitInstantMsBangkok(String(row.visit_date), row.visit_time, row.created_at)
      let idx = -1
      for (let i = pending.length - 1; i >= 0; i--) {
        if (pending[i].store === store) {
          idx = i
          break
        }
      }
      if (idx < 0) continue
      const [start] = pending.splice(idx, 1)
      completed.push({
        store: start.store,
        purpose: start.purpose,
        startMs: start.startMs,
        endMs: Math.max(endMs, start.startMs),
        implicitClose: false,
      })
    }
  }

  return { completed, open: pending }
}

/** open이 있으면 가장 최근 시작 1건 (상태 API용) */
export function latestOpenVisit(open: StoreVisitOpen[]): StoreVisitOpen | null {
  if (open.length === 0) return null
  return open.reduce((a, b) => (a.startMs >= b.startMs ? a : b))
}
