/**
 * 플로어 점유: 당일 영업일 getPosOrders 밖에 남은 QR 세션 연동 주문을 합친다.
 * (전일 미결제 QR 홀이 바닥에 안 붙는 The Street형 갭 방지)
 */

export type QrFloorCarryoverSessionRef = {
  posOrderId?: number | null
}

/** 세션에 묶였지만 당일 스냅샷에 없는 pos_order id */
export function collectQrCarryoverOrderIds(params: {
  existingOrderIds: Iterable<number | string | null | undefined>
  sessions: QrFloorCarryoverSessionRef[] | null | undefined
}): number[] {
  const have = new Set<number>()
  for (const raw of params.existingOrderIds) {
    const id = Math.trunc(Number(raw))
    if (Number.isFinite(id) && id > 0) have.add(id)
  }
  const out: number[] = []
  const seen = new Set<number>()
  for (const s of params.sessions || []) {
    const id = Math.trunc(Number(s.posOrderId ?? 0))
    if (!Number.isFinite(id) || id <= 0 || have.has(id) || seen.has(id)) continue
    seen.add(id)
    out.push(id)
  }
  return out
}

/** id 기준 합집합 — extra가 같은 id면 extra로 덮어씀(단건 full select 우선) */
export function mergePosOrdersById<T extends { id?: number | string | null }>(
  base: T[],
  extra: T[]
): T[] {
  const byId = new Map<number, T>()
  const noId: T[] = []
  for (const row of base || []) {
    const id = Math.trunc(Number(row.id ?? 0))
    if (Number.isFinite(id) && id > 0) byId.set(id, row)
    else noId.push(row)
  }
  for (const row of extra || []) {
    const id = Math.trunc(Number(row.id ?? 0))
    if (Number.isFinite(id) && id > 0) byId.set(id, row)
    else noId.push(row)
  }
  return [...byId.values(), ...noId]
}
