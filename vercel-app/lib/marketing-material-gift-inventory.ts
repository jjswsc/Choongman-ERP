import type { MarketingMaterialGift } from '@/lib/api-client'

/** 배정−배포 기준 잔여 (항상 0 이상) */
export function computedGiftRemaining(allocatedQty: number, distributedQty: number): number {
  return Math.max(0, Math.floor(allocatedQty) - Math.floor(distributedQty))
}

export function giftRowQtyMismatch(g: MarketingMaterialGift): boolean {
  const expected = computedGiftRemaining(g.allocatedQty, g.distributedQty)
  return Math.floor(g.remainingQty) !== expected
}

export type GiftInventoryGroupRow = {
  materialId: string
  giftName: string
  materialName: string
  /** 홍보물 등록 수량(제작·입고 등 참고용) */
  materialQuantity: number
  /** 매장별 배정 행 수 */
  storeRowCount: number
  /** 서로 다른 매장 수 */
  uniqueStoreCount: number
  totalAllocated: number
  totalDistributed: number
  /** DB에 저장된 잔여 합 */
  totalRemainingStored: number
  /** 배정−배포로 계산한 잔여 합 */
  totalRemainingComputed: number
  /** 홍보물 수량 − 배정 합 (사은품 재고를 홍보물 수량에 맞출 때 참고; 음수면 초과 배정) */
  poolVsAllocated: number
  /** 잔여가 계산값과 다른 행 수 */
  mismatchRowCount: number
}

/**
 * 캠페인(또는 목록) 단위 사은품 재고 집계: 홍보물+사은품명 기준.
 */
export function aggregateGiftInventoryGroups(
  gifts: MarketingMaterialGift[],
  materialMetaById: Record<string, { name: string; quantity: number }>
): GiftInventoryGroupRow[] {
  const byKey = new Map<
    string,
    {
      materialId: string
      giftName: string
      rows: MarketingMaterialGift[]
    }
  >()

  for (const g of gifts) {
    const mid = String(g.materialId ?? '').trim()
    const gn = String(g.giftName ?? '').trim()
    if (!mid) continue
    const key = `${mid}\0${gn || '—'}`
    let bucket = byKey.get(key)
    if (!bucket) {
      bucket = { materialId: mid, giftName: gn || '—', rows: [] }
      byKey.set(key, bucket)
    }
    bucket.rows.push(g)
  }

  const out: GiftInventoryGroupRow[] = []
  for (const { materialId, giftName, rows } of byKey.values()) {
    const meta = materialMetaById[materialId]
    const materialName = meta?.name ?? `#${materialId}`
    const materialQuantity = Math.max(0, Math.floor(meta?.quantity ?? 0))

    let totalAllocated = 0
    let totalDistributed = 0
    let totalRemainingStored = 0
    let totalRemainingComputed = 0
    let mismatchRowCount = 0
    const stores = new Set<string>()

    for (const r of rows) {
      const a = Math.max(0, Math.floor(r.allocatedQty))
      const d = Math.max(0, Math.floor(r.distributedQty))
      const remS = Math.max(0, Math.floor(r.remainingQty))
      const remC = computedGiftRemaining(a, d)
      totalAllocated += a
      totalDistributed += d
      totalRemainingStored += remS
      totalRemainingComputed += remC
      if (remS !== remC) mismatchRowCount += 1
      const sn = String(r.storeName ?? '').trim()
      if (sn) stores.add(sn)
    }

    out.push({
      materialId,
      giftName,
      materialName,
      materialQuantity,
      storeRowCount: rows.length,
      uniqueStoreCount: stores.size,
      totalAllocated,
      totalDistributed,
      totalRemainingStored,
      totalRemainingComputed,
      poolVsAllocated: materialQuantity - totalAllocated,
      mismatchRowCount,
    })
  }

  out.sort((x, y) => {
    const c = x.materialName.localeCompare(y.materialName)
    if (c !== 0) return c
    return x.giftName.localeCompare(y.giftName)
  })

  return out
}

export function sumInventoryTotals(groups: GiftInventoryGroupRow[]) {
  return groups.reduce(
    (acc, g) => ({
      storeRowCount: acc.storeRowCount + g.storeRowCount,
      uniqueSkus: acc.uniqueSkus + 1,
      totalAllocated: acc.totalAllocated + g.totalAllocated,
      totalDistributed: acc.totalDistributed + g.totalDistributed,
      totalRemainingStored: acc.totalRemainingStored + g.totalRemainingStored,
      totalRemainingComputed: acc.totalRemainingComputed + g.totalRemainingComputed,
      groupsWithMismatch: acc.groupsWithMismatch + (g.mismatchRowCount > 0 ? 1 : 0),
      mismatchRows: acc.mismatchRows + g.mismatchRowCount,
    }),
    {
      storeRowCount: 0,
      uniqueSkus: 0,
      totalAllocated: 0,
      totalDistributed: 0,
      totalRemainingStored: 0,
      totalRemainingComputed: 0,
      groupsWithMismatch: 0,
      mismatchRows: 0,
    }
  )
}
