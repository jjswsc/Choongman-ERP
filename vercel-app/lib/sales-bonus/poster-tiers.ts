import type { SalesBonusTier } from '@/lib/sales-bonus/types'

/** 포스터: 목표 달성 1,000 + 초과 10만당 500 (누적). 기본 초과 구간 20칸. */
export function buildPosterSalesBonusTiers(
  baseTarget: number,
  opts?: { stepBaht?: number; stepBonus?: number; baseBonus?: number; extraSteps?: number }
): SalesBonusTier[] {
  const base = Math.round(Number(baseTarget) || 0)
  if (base <= 0) return []
  const stepBaht = opts?.stepBaht ?? 100_000
  const stepBonus = opts?.stepBonus ?? 500
  const baseBonus = opts?.baseBonus ?? 1_000
  const extraSteps = opts?.extraSteps ?? 20
  const tiers: SalesBonusTier[] = [{ threshold: base, amount: baseBonus }]
  for (let i = 1; i <= extraSteps; i++) {
    tiers.push({ threshold: base + i * stepBaht, amount: stepBonus })
  }
  return tiers
}

/**
 * 충만 치킨 포스터(2025) 1차 세팅.
 * MBK는 포스터 150만이 아니라 160만으로 반영.
 * 인원수 증가 시 목표 +10만(엑카마이 11명=+5만)은 수동 조정.
 */
export const CHOONGMAN_POSTER_SALES_BONUS_BASES: ReadonlyArray<{
  storeCode: string
  label: string
  baseTarget: number
  staffCountNote: number
}> = [
  { storeCode: 'CM The Street', label: 'The Street', baseTarget: 1_600_000, staffCountNote: 15 },
  { storeCode: 'CM Silom', label: 'Silom', baseTarget: 1_700_000, staffCountNote: 14 },
  { storeCode: 'CM Ekkamai', label: 'At Ekkamai', baseTarget: 1_200_000, staffCountNote: 10 },
  { storeCode: 'CM Future Park', label: 'Future Park', baseTarget: 900_000, staffCountNote: 10 },
  { storeCode: 'CM Union Mall', label: 'Union Mall', baseTarget: 1_400_000, staffCountNote: 12 },
  { storeCode: 'CM K-Village', label: 'K-Village', baseTarget: 1_300_000, staffCountNote: 11 },
  { storeCode: 'CM Huamak', label: 'Huamark', baseTarget: 1_200_000, staffCountNote: 11 },
  { storeCode: 'CM Seacon Srinakarin', label: 'Seacon', baseTarget: 1_000_000, staffCountNote: 11 },
  { storeCode: 'CM True Digital', label: 'TRUE', baseTarget: 1_200_000, staffCountNote: 11 },
  { storeCode: 'CM MBK', label: 'MBK CENTER', baseTarget: 1_600_000, staffCountNote: 13 },
]
