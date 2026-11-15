import { roleTextMatchesManager } from '@/lib/permissions'
import type {
  SalesBonusExplainLine,
  SalesBonusPersonResult,
  SalesBonusTier,
  StoreSalesBonusSettings,
} from '@/lib/sales-bonus/types'

function finiteNonNeg(n: unknown, fallback = 0): number {
  const x = Number(n)
  if (!Number.isFinite(x)) return fallback
  return Math.max(0, x)
}

/** 임계값 오름차순·유효한 구간만 */
export function normalizeSalesBonusTiers(raw: unknown): SalesBonusTier[] {
  if (!Array.isArray(raw)) return []
  const out: SalesBonusTier[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const threshold = finiteNonNeg(o.threshold ?? o.minSales ?? o.min)
    const amount = finiteNonNeg(o.amount ?? o.bonus)
    if (threshold <= 0 && amount <= 0) continue
    out.push({ threshold, amount })
  }
  out.sort((a, b) => a.threshold - b.threshold || a.amount - b.amount)
  return out
}

/** 매출이 넘는 구간의 amount를 누적 */
export function sumCumulativeTierBonus(salesTotal: number, tiers: SalesBonusTier[]): {
  baseAmount: number
  appliedTiers: SalesBonusTier[]
} {
  const sales = finiteNonNeg(salesTotal)
  const applied: SalesBonusTier[] = []
  let base = 0
  for (const t of normalizeSalesBonusTiers(tiers)) {
    if (sales >= t.threshold) {
      applied.push(t)
      base += t.amount
    }
  }
  return { baseAmount: Math.round(base * 100) / 100, appliedTiers: applied }
}

export function resolveSalesBonusMultiplier(
  role: string,
  settings: Pick<StoreSalesBonusSettings, 'managerMultiplier' | 'staffMultiplier'>
): number {
  const mgr = finiteNonNeg(settings.managerMultiplier, 2)
  const staff = finiteNonNeg(settings.staffMultiplier, 1)
  return roleTextMatchesManager(role) ? (mgr > 0 ? mgr : 2) : staff > 0 ? staff : 1
}

/**
 * 1인 매출 보너스.
 * base = Σ tier · roleAmt = base × multiplier · final = max(0, roleAmt × (1 − pct/100 × days))
 */
export function computePersonSalesBonus(params: {
  enabled: boolean
  salesTotal: number
  tiers: SalesBonusTier[]
  role: string
  managerMultiplier: number
  staffMultiplier: number
  absenceDays: number
  absencePenaltyPctPerDay: number
}): SalesBonusPersonResult {
  const empty = (extra?: SalesBonusExplainLine[]): SalesBonusPersonResult => ({
    baseAmount: 0,
    multiplier: 1,
    roleAmount: 0,
    absenceDays: Math.max(0, Math.floor(Number(params.absenceDays) || 0)),
    penaltyPct: 0,
    penaltyAmount: 0,
    finalAmount: 0,
    appliedTiers: [],
    explain: extra || [],
  })

  if (!params.enabled) {
    return empty([{ reason: '매출 보너스 비활성', detail: '매장 설정에서 사용 안 함' }])
  }

  const { baseAmount, appliedTiers } = sumCumulativeTierBonus(params.salesTotal, params.tiers)
  const multiplier = resolveSalesBonusMultiplier(params.role, params)
  const roleAmount = Math.round(baseAmount * multiplier * 100) / 100
  const absenceDays = Math.max(0, Math.floor(Number(params.absenceDays) || 0))
  const pctPerDay = finiteNonNeg(params.absencePenaltyPctPerDay)
  const penaltyPct = Math.min(100, pctPerDay * absenceDays)
  const penaltyAmount =
    roleAmount > 0 && penaltyPct > 0
      ? Math.round(roleAmount * (penaltyPct / 100) * 100) / 100
      : 0
  const finalAmount = Math.max(0, Math.round((roleAmount - penaltyAmount) * 100) / 100)

  const explain: SalesBonusExplainLine[] = []
  if (appliedTiers.length === 0) {
    explain.push({
      reason: '적용 구간 없음',
      detail: `기간 매출 ${Math.floor(finiteNonNeg(params.salesTotal))} — 임계 미달`,
      amount: 0,
    })
  } else {
    for (const t of appliedTiers) {
      explain.push({
        reason: '매출 구간 누적',
        detail: `매출 ≥ ${Math.floor(t.threshold)} → +${Math.floor(t.amount)}`,
        amount: t.amount,
      })
    }
  }
  if (baseAmount > 0 && multiplier !== 1) {
    explain.push({
      reason: '역할 배수',
      detail: `× ${multiplier}`,
      amount: roleAmount,
    })
  }
  if (penaltyAmount > 0) {
    explain.push({
      reason: '결근 패널티',
      detail: `${absenceDays}일 × ${pctPerDay}% = −${penaltyPct}%`,
      amount: -penaltyAmount,
    })
  }
  if (finalAmount > 0 || (baseAmount > 0 && finalAmount === 0)) {
    explain.push({
      reason: '최종 매출 보너스',
      detail: `기본 ${Math.floor(baseAmount)} × ${multiplier} − 패널티`,
      amount: finalAmount,
    })
  }

  return {
    baseAmount,
    multiplier,
    roleAmount,
    absenceDays,
    penaltyPct,
    penaltyAmount,
    finalAmount,
    appliedTiers,
    explain,
  }
}

export function parseStoreSalesBonusSettingsRow(
  row: Record<string, unknown> | null | undefined,
  storeCodeFallback = ''
): StoreSalesBonusSettings {
  const r = row || {}
  const storeCode = String(r.store_code ?? r.storeCode ?? storeCodeFallback).trim()
  return {
    storeCode,
    enabled: r.enabled === true || r.enabled === 'true' || r.enabled === 1,
    absencePenaltyPctPerDay: finiteNonNeg(r.absence_penalty_pct_per_day ?? r.absencePenaltyPctPerDay),
    managerMultiplier: finiteNonNeg(r.manager_multiplier ?? r.managerMultiplier, 2) || 2,
    staffMultiplier: finiteNonNeg(r.staff_multiplier ?? r.staffMultiplier, 1) || 1,
    tiers: normalizeSalesBonusTiers(r.tiers),
    updatedAt: r.updated_at != null ? String(r.updated_at) : undefined,
  }
}

export function defaultStoreSalesBonusSettings(storeCode: string): StoreSalesBonusSettings {
  return {
    storeCode: String(storeCode || '').trim(),
    enabled: false,
    absencePenaltyPctPerDay: 0,
    managerMultiplier: 2,
    staffMultiplier: 1,
    tiers: [],
  }
}
