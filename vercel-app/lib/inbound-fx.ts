import { roundErp3 } from '@/lib/utils'

export type InboundSourceCurrency = 'THB' | 'KRW'

/** inbound_batches.fx_rate numeric(18, 6) 과 맞춤 */
export const INBOUND_FX_RATE_DECIMALS = 6

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

export function roundInboundFxRate(value: number): number {
  const factor = 10 ** INBOUND_FX_RATE_DECIMALS
  return Math.round(value * factor) / factor
}

/** 환율 입력란 표시 — 소수 6자리까지, trailing 0 제거 */
export function formatInboundFxRateInput(n: number | string | null | undefined): string {
  const parsed = parseInboundFxRate(n)
  if (parsed == null) return ''
  const r = roundInboundFxRate(parsed)
  return r.toFixed(INBOUND_FX_RATE_DECIMALS).replace(/\.?0+$/, '')
}

/** 환율 입력 — 숫자·소수점만, 소수 6자리까지 */
export function normalizeInboundFxRateInput(raw: string): string {
  const cleaned = String(raw || '').replace(/,/g, '').replace(/[^\d.]/g, '')
  if (cleaned === '') return ''
  const firstDot = cleaned.indexOf('.')
  let intRaw: string
  let fracRaw: string
  if (firstDot === -1) {
    intRaw = cleaned
    fracRaw = ''
  } else {
    intRaw = cleaned.slice(0, firstDot)
    fracRaw = cleaned.slice(firstDot + 1).replace(/\./g, '')
  }
  fracRaw = fracRaw.slice(0, INBOUND_FX_RATE_DECIMALS)
  const endsWithDot = cleaned.endsWith('.') && fracRaw === '' && cleaned.includes('.')
  if (intRaw === '' && fracRaw === '') return endsWithDot ? '0.' : ''
  if (intRaw === '' && fracRaw !== '') return `0.${fracRaw}`
  if (fracRaw !== '') return `${intRaw}.${fracRaw}`
  if (endsWithDot) return `${intRaw}.`
  return intRaw
}

/** 원화 단가 → THB 단가 (ERP 소수 3자리) */
export function thbUnitCostFromKrw(sourceUnitCostKrw: number, fxRateKrwPerThb: number): number {
  if (!Number.isFinite(sourceUnitCostKrw) || sourceUnitCostKrw < 0) return 0
  if (!Number.isFinite(fxRateKrwPerThb) || fxRateKrwPerThb <= 0) return 0
  return roundErp3(sourceUnitCostKrw / fxRateKrwPerThb)
}

/**
 * 원화 단가 + 바트 단가 → 환율(1 THB당 KRW).
 * 둘 다 양수일 때만 계산.
 */
export function fxRateFromKrwAndThb(sourceUnitCostKrw: number, thbUnitCost: number): number | null {
  if (!Number.isFinite(sourceUnitCostKrw) || sourceUnitCostKrw <= 0) return null
  if (!Number.isFinite(thbUnitCost) || thbUnitCost <= 0) return null
  const rate = sourceUnitCostKrw / thbUnitCost
  if (!Number.isFinite(rate) || rate <= 0) return null
  return roundInboundFxRate(rate)
}

/**
 * 원화 단가·수량 + 바트 줄 금액 → 환율.
 * 바트 단가 = 바트 금액 ÷ 수량.
 */
export function fxRateFromKrwQtyAndThbAmount(
  sourceUnitCostKrw: number,
  qty: number,
  thbAmount: number
): number | null {
  if (!Number.isFinite(qty) || qty <= 0) return null
  if (!Number.isFinite(thbAmount) || thbAmount <= 0) return null
  return fxRateFromKrwAndThb(sourceUnitCostKrw, thbAmount / qty)
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
