/** 매출 구간: 임계 매출 이상이면 amount를 누적 */
export type SalesBonusTier = {
  threshold: number
  amount: number
}

export type StoreSalesBonusSettings = {
  storeCode: string
  enabled: boolean
  absencePenaltyPctPerDay: number
  managerMultiplier: number
  staffMultiplier: number
  tiers: SalesBonusTier[]
  updatedAt?: string
}

export type SalesBonusExplainLine = {
  reason: string
  detail?: string
  amount?: number
}

export type SalesBonusPersonResult = {
  baseAmount: number
  multiplier: number
  roleAmount: number
  absenceDays: number
  penaltyPct: number
  penaltyAmount: number
  finalAmount: number
  appliedTiers: SalesBonusTier[]
  explain: SalesBonusExplainLine[]
}
