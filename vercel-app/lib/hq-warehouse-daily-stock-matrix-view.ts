/**
 * 본사 일별 입출고 매트릭스 — 보기 모드·표시 유틸 (클라이언트·서버 공용).
 */
import { addBangkokCalendarDays } from '@/lib/bangkok-time'
import type { HqWarehouseDailyItemRow, HqWarehouseMovementColumn } from '@/lib/hq-warehouse-daily-stock-matrix'

export type MatrixViewMode = 'detail' | 'daily_total' | 'store_pivot'

export function computePriorPeriodRange(startStr: string, endStr: string): { priorStart: string; priorEnd: string } {
  const lo = startStr.trim().slice(0, 10)
  const hi = endStr.trim().slice(0, 10)
  const days =
    Math.max(
      1,
      Math.round(
        (Date.parse(hi) - Date.parse(lo)) / 86400000
      ) + 1
    )
  const priorEnd = addBangkokCalendarDays(lo, -1)
  const priorStart = addBangkokCalendarDays(lo, -days)
  return { priorStart, priorEnd }
}

/** 태국 불기 DD/MM/YYYY+543 */
export function formatYmdThaiBuddhist(ymd: string, useThai = true): string {
  const p = ymd.trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return ymd
  const [y, m, d] = p.split('-')
  if (!useThai) return `${m}/${d}/${y}`
  const by = Number(y) + 543
  return `${d}/${m}/${by}`
}

export function buildDailyOutSparkline(
  columns: HqWarehouseMovementColumn[],
  cells: Record<string, number>
): number[] {
  const byDay = new Map<string, number>()
  for (const col of columns) {
    if (col.kind !== 'out') continue
    const v = cells[col.key] || 0
    if (!v) continue
    byDay.set(col.ymd, (byDay.get(col.ymd) || 0) + v)
  }
  const days = [...byDay.keys()].sort()
  return days.map((d) => byDay.get(d) || 0)
}

function remapItemCells(
  items: HqWarehouseDailyItemRow[],
  colKeyMap: Map<string, string>
): HqWarehouseDailyItemRow[] {
  return items.map((row) => {
    const next: Record<string, number> = {}
    for (const [oldKey, v] of Object.entries(row.cells)) {
      const newKey = colKeyMap.get(oldKey)
      if (!newKey || !v) continue
      next[newKey] = (next[newKey] || 0) + v
    }
    return { ...row, cells: next }
  })
}

/** 상세 열 → 일별 합계 / 매장 피벗 */
export function applyMatrixViewMode(
  columns: HqWarehouseMovementColumn[],
  items: HqWarehouseDailyItemRow[],
  mode: MatrixViewMode
): { columns: HqWarehouseMovementColumn[]; items: HqWarehouseDailyItemRow[] } {
  if (mode === 'detail' || columns.length === 0) {
    return { columns, items }
  }

  if (mode === 'daily_total') {
    const newCols: HqWarehouseMovementColumn[] = []
    const colKeyMap = new Map<string, string>()
    const dayKeys = new Map<string, { in?: string; adj?: string; out?: string }>()

    for (const c of columns) {
      let bucket = dayKeys.get(c.ymd)
      if (!bucket) {
        bucket = {}
        dayKeys.set(c.ymd, bucket)
      }
      if (c.kind === 'in') {
        const key = `in|${c.ymd}`
        bucket.in = key
        if (!newCols.find((x) => x.key === key)) {
          newCols.push({ key, ymd: c.ymd, kind: 'in', label: 'IN' })
        }
        colKeyMap.set(c.key, key)
      } else if (c.kind === 'adjust') {
        const key = `adj|${c.ymd}`
        bucket.adj = key
        if (!newCols.find((x) => x.key === key)) {
          newCols.push({ key, ymd: c.ymd, kind: 'adjust', label: 'ADJ' })
        }
        colKeyMap.set(c.key, key)
      } else if (c.kind === 'out') {
        const key = `out_sum|${c.ymd}`
        bucket.out = key
        if (!newCols.find((x) => x.key === key)) {
          newCols.push({ key, ymd: c.ymd, kind: 'out', label: 'OUT Σ' })
        }
        colKeyMap.set(c.key, key)
      }
    }

    const sorted = [...newCols].sort((a, b) => {
      if (a.ymd !== b.ymd) return a.ymd.localeCompare(b.ymd)
      const ko = { in: 0, out: 1, adjust: 2 }
      return ko[a.kind] - ko[b.kind]
    })
    return { columns: sorted, items: remapItemCells(items, colKeyMap) }
  }

  // store_pivot
  const storeSet = new Set<string>()
  for (const c of columns) {
    if (c.kind === 'out' && c.store) storeSet.add(c.store)
  }
  const stores = [...storeSet].sort()
  const newCols: HqWarehouseMovementColumn[] = stores.map((store) => ({
    key: `store|${store}`,
    ymd: '',
    kind: 'out' as const,
    store,
    label: store,
  }))
  const colKeyMap = new Map<string, string>()
  for (const c of columns) {
    if (c.kind === 'out' && c.store) {
      colKeyMap.set(c.key, `store|${c.store}`)
    }
  }
  return { columns: newCols, items: remapItemCells(items, colKeyMap) }
}

export function pctChange(current: number, prior: number): number | null {
  if (!prior) return current > 0 ? 100 : null
  return Math.round(((current - prior) / prior) * 1000) / 10
}
