/** 매출 구간: 임계 매출 이상이면 amount를 누적 */
export type SalesBonusTier = {
  threshold: number
  amount: number
}

export type StoreSalesBonusSettings = {
  storeCode: string
  enabled: boolean
  absencePenaltyPctPerDay: number
  /** 지정자(doubleBonusEmployeeId)에게 적용하는 배수. 기본 2 */
  managerMultiplier: number
  /** 그 외 직원 배수. 기본 1 */
  staffMultiplier: number
  /** 배수 대상 직원 employees.id (역할 무관, 매장당 1명) */
  doubleBonusEmployeeId: number | null
  /** 0 = 익월 급여일 연동, 1~28 = 익월 고정 지급일 (매출은 달력월 전체 집계) */
  payoutDay: number
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
  isDoubleBonusDesignee?: boolean
}
