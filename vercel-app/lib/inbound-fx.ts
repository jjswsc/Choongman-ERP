import { roundErp3 } from '@/lib/utils'

export type InboundSourceCurrency = 'THB' | 'KRW'

/** body/UI 통화 문자열 정규화 — 그 외는 THB */
export function normalizeInboundSourceCurrency(raw: unknown): InboundSourceCurrency {
  const v = String(raw ?? '').trim().toUpperCase()
  return v === 'KRW' ? 'KRW' : 'THB'
}

/**
 * fx_rate = 1 THB당 KRW (예: 40 → 바트단가 = 원화단가 ÷ 40)
 * 환율이 없거나 0 이하면 null (호출측에서 거부)
 */
export function parseInboundFxRate(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(n) || n <= 0) return null
  return n
}

/** 원화 단가 → THB 단가 (ERP 소수 3자리) */
export function thbUnitCostFromKrw(sourceUnitCostKrw: number, fxRateKrwPerThb: number): number {
  if (!Number.isFinite(sourceUnitCostKrw) || sourceUnitCostKrw < 0) return 0
  if (!Number.isFinite(fxRateKrwPerThb) || fxRateKrwPerThb <= 0) return 0
  return roundErp3(sourceUnitCostKrw / fxRateKrwPerThb)
}

export type ResolveInboundLineCostResult =
  | { ok: true; unitCostThb: number | null; sourceUnitCost: number | null }
  | { ok: false; message: string }

/**
 * 줄 cost(입력값)를 THB unit_cost + 선택적 source_unit_cost로 변환.
 * KRW: cost = 원화, THB: cost = 바트.
 * cost 미입력이면 unitCostThb/sourceUnitCost 모두 null (기존 등록 API와 동일하게 unit_cost 생략 가능).
 */
export function resolveInboundLineCost(params: {
  costRaw: unknown
  sourceCurrency: InboundSourceCurrency
  fxRate: number | null
}): ResolveInboundLineCostResult {
  const { costRaw, sourceCurrency, fxRate } = params
  if (costRaw == null || costRaw === '') {
    if (sourceCurrency === 'KRW') {
      return { ok: false, message: '원화 단가를 입력하세요.' }
    }
    return { ok: true, unitCostThb: null, sourceUnitCost: null }
  }
  const costVal = typeof costRaw === 'number' ? costRaw : parseFloat(String(costRaw).replace(/,/g, ''))
  if (!Number.isFinite(costVal) || costVal < 0) {
    return { ok: false, message: '단가가 올바르지 않습니다.' }
  }

  if (sourceCurrency === 'KRW') {
    if (fxRate == null || fxRate <= 0) {
      return { ok: false, message: '원화 입고 시 환율(1 THB당 KRW)을 입력하세요.' }
    }
    return {
      ok: true,
      unitCostThb: thbUnitCostFromKrw(costVal, fxRate),
      sourceUnitCost: roundErp3(costVal),
    }
  }

  return { ok: true, unitCostThb: roundErp3(costVal), sourceUnitCost: null }
}

/** KRW 배치 저장 전 헤더 검증 */
export function validateInboundFxHeader(
  sourceCurrency: InboundSourceCurrency,
  fxRate: number | null
): string | null {
  if (sourceCurrency === 'KRW' && (fxRate == null || fxRate <= 0)) {
    return '원화 입고 시 환율(1 THB당 KRW)을 입력하세요.'
  }
  return null
}
