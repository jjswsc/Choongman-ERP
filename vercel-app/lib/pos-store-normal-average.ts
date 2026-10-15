/**
 * 매장 정상 원가 — 평균(KPI)에서 뺄 매장. 입력이 불완전한 가맹점(통장 미등록·재고 미차감 등)을
 * 빼고 평균을 보기 위해 브라우저에 저장한다. 표에는 계속 보인다.
 */
import {
  resolveStoreNormalAccounting,
  resolveStoreNormalBom,
  resolveStoreNormalPosSales,
  type StoreNormalCostRow,
  type StoreNormalVatMode,
} from '@/lib/pos-store-normal-cost'

export const STORE_NORMAL_AVG_EXCLUDED_KEY = 'cm-pos-store-normal-avg-excluded-v1'

export function parseStoreNormalAvgExcluded(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  const out = new Set<string>()
  for (const v of raw) {
    const code = typeof v === 'string' ? v.trim() : ''
    if (code) out.add(code)
  }
  return [...out]
}

export function readStoreNormalAvgExcluded(): string[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORE_NORMAL_AVG_EXCLUDED_KEY)
    return raw ? parseStoreNormalAvgExcluded(JSON.parse(raw)) : []
  } catch {
    return []
  }
}

export function writeStoreNormalAvgExcluded(codes: string[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORE_NORMAL_AVG_EXCLUDED_KEY, JSON.stringify(parseStoreNormalAvgExcluded(codes)))
  } catch {
    /* quota */
  }
}

export function storeNormalTheoryPct(row: StoreNormalCostRow, vatMode: StoreNormalVatMode): number | null {
  const net = resolveStoreNormalPosSales(row, vatMode).net
  const bom = resolveStoreNormalBom(row.bomCost, vatMode)
  if (!(net > 0.0001) || !Number.isFinite(bom)) return null
  return (bom / net) * 100
}

export function storeNormalGapPct(row: StoreNormalCostRow, vatMode: StoreNormalVatMode): number | null {
  const actual = resolveStoreNormalAccounting(row, vatMode).costPct
  const theory = storeNormalTheoryPct(row, vatMode)
  if (actual == null || theory == null) return null
  return Math.round((actual - theory) * 100) / 100
}

export type StoreNormalKpi = {
  normalPct: number | null
  plPct: number | null
  higherPl: number
  /** 평균에 들어간 매장 수 */
  stores: number
  /** 이번 결과에서 평균에서 뺀 매장 수 */
  excludedStores: number
}

/** 이론·실제 원가율은 매출 가중 평균. excluded 매장은 합계에서 뺀다. */
export function computeStoreNormalKpi(
  rows: StoreNormalCostRow[],
  vatMode: StoreNormalVatMode,
  excluded: ReadonlySet<string>
): StoreNormalKpi {
  let net = 0
  let bom = 0
  let plSales = 0
  let plCogs = 0
  let higherPl = 0
  let stores = 0
  let excludedStores = 0
  for (const row of rows) {
    if (excluded.has(row.storeCode)) {
      excludedStores += 1
      continue
    }
    stores += 1
    net += resolveStoreNormalPosSales(row, vatMode).net
    bom += resolveStoreNormalBom(row.bomCost, vatMode)
    const pl = resolveStoreNormalAccounting(row, vatMode)
    if (pl.sales != null && pl.sales > 0.0001 && pl.cogs != null) {
      plSales += pl.sales
      plCogs += pl.cogs
    }
    if ((storeNormalGapPct(row, vatMode) ?? 0) > 0.5) higherPl += 1
  }
  return {
    normalPct: net > 0.0001 ? (bom / net) * 100 : null,
    plPct: plSales > 0.0001 ? (plCogs / plSales) * 100 : null,
    higherPl,
    stores,
    excludedStores,
  }
}
