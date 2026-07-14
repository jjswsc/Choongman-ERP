import { normalizePosTableNameForMatch } from '@/lib/pos-print-translate'

export type PosTableFloor = 1 | 2 | 3

export function clampPosTableFloor(n: number): PosTableFloor {
  return Math.min(3, Math.max(1, Math.trunc(n) || 1)) as PosTableFloor
}

/** `1F-3`, `2층 4번`, `F2-3` 등 라벨 앞쪽 층 번호 */
export function parsePosTableFloorFromLabel(raw: string | undefined | null): PosTableFloor | null {
  const s = String(raw ?? '').trim()
  if (!s) return null
  const m1 = s.match(/^(\d+)\s*f(?:loor)?\s*[-_/]?\s*/iu)
  if (m1) return clampPosTableFloor(Number(m1[1]))
  const m2 = s.match(/^f\s*(\d+)\s*[-_/]?\s*/iu)
  if (m2) return clampPosTableFloor(Number(m2[1]))
  const m3 = s.match(/^(\d+)\s*층\s*[-_/]?\s*/u)
  if (m3) return clampPosTableFloor(Number(m3[1]))
  const m4 = s.match(/^b\s*(\d+)\s*[-_/]?\s*/iu)
  if (m4) return clampPosTableFloor(Number(m4[1]))
  return null
}

/** DB·주문 저장용 — 다층 매장이면 `2F-3` 형태로 층을 남김 */
export function formatPosDineInTableNameForStorage(
  tableName: string,
  layoutFloor: number | undefined,
  multiFloorLayout: boolean
): string {
  const name = String(tableName ?? '').trim()
  if (!name || !multiFloorLayout) return name
  if (parsePosTableFloorFromLabel(name) != null) return name
  const floor = clampPosTableFloor(Number(layoutFloor ?? 1) || 1)
  if (floor <= 1) return name
  const norm = normalizePosTableNameForMatch(name)
  if (!norm) return name
  return `${floor}F-${norm}`
}

export type PosDineInTableRef = {
  name: string
  id?: string
  floor: PosTableFloor
}

function labelsMatchByNameOrNorm(orderRaw: string, tableName: string, tableId: string): boolean {
  if (orderRaw === tableName || (tableId && orderRaw === tableId)) return true
  const orderNorm = normalizePosTableNameForMatch(orderRaw)
  if (!orderNorm) return false
  const nameNorm = normalizePosTableNameForMatch(tableName)
  const idNorm = normalizePosTableNameForMatch(tableId)
  return orderNorm === nameNorm || (idNorm ? orderNorm === idNorm : false)
}

/** 홀 주문 `table_name` ↔ 배치 테이블(층 포함) 일치 여부 */
export function posDineInTableLabelsMatch(
  orderTableName: string,
  table: PosDineInTableRef,
  options?: { layoutPeers?: PosDineInTableRef[] }
): boolean {
  const orderRaw = String(orderTableName ?? '').trim()
  if (!orderRaw) return false
  const tableName = String(table.name ?? '').trim()
  const tableId = String(table.id ?? '').trim()
  const layoutFloor = table.floor

  const orderFloor = parsePosTableFloorFromLabel(orderRaw)
  const tableNameFloor = parsePosTableFloorFromLabel(tableName)

  if (orderFloor != null && orderFloor !== layoutFloor) return false
  if (orderFloor == null && tableNameFloor != null && tableNameFloor !== layoutFloor) return false

  if (!labelsMatchByNameOrNorm(orderRaw, tableName, tableId)) return false

  if (orderFloor != null || tableNameFloor != null) return true

  const peers = options?.layoutPeers ?? []
  const norm = normalizePosTableNameForMatch(tableName)
  const floorsWithNorm = new Set(
    peers
      .filter((p) => normalizePosTableNameForMatch(p.name) === norm)
      .map((p) => p.floor)
  )
  if (floorsWithNorm.size <= 1) return true
  return layoutFloor === 1
}

export function resolveDineInOrderForLayoutTable<T extends { tableName?: string | null; createdAt?: string | Date | null }>(
  layoutItem: PosDineInTableRef,
  dineInOrders: T[],
  layoutPeers: PosDineInTableRef[]
): T | undefined {
  const candidates = dineInOrders.filter((o) =>
    posDineInTableLabelsMatch(String(o.tableName ?? ''), layoutItem, { layoutPeers })
  )
  if (candidates.length === 0) return undefined
  let best = candidates[0]
  for (const o of candidates.slice(1)) {
    const a = new Date(best.createdAt || 0).getTime()
    const b = new Date(o.createdAt || 0).getTime()
    if (b >= a) best = o
  }
  return best
}

/** 터미널 pending·낙관적 병합용 키 */
export function posDineInTableMatchKey(tableName: string, layoutFloor?: number): string {
  const raw = String(tableName ?? '').trim()
  const floor = parsePosTableFloorFromLabel(raw) ?? clampPosTableFloor(Number(layoutFloor ?? 1) || 1)
  const norm = normalizePosTableNameForMatch(raw)
  return norm ? `${floor}:${norm}` : ''
}

export function layoutHasMultipleFloors(
  layout: Array<{ floor?: number | null }> | undefined | null
): boolean {
  const floors = new Set<number>()
  for (const item of layout || []) {
    floors.add(clampPosTableFloor(Number(item?.floor ?? 1) || 1))
  }
  return floors.size > 1
}
