import { roundMoney2 } from '@/lib/invoice-vat-total'
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
function parseNonNegativeMoney(raw: unknown): number | null {
  if (raw == null || raw === '') return null
  const n = typeof raw === 'number' ? raw : parseFloat(String(raw).replace(/,/g, ''))
  if (!Number.isFinite(n) || n < 0) return null
  return n
}

export function resolveInboundLineCost(params: {
  costRaw: unknown
  sourceCurrency: InboundSourceCurrency
  fxRate: number | null
  /** KRW 입고에서 바트 총액 분배 결과. 있으면 환율 환산 대신 이 단가를 기록 */
  thbUnitCostRaw?: unknown
}): ResolveInboundLineCostResult {
  const { costRaw, sourceCurrency, fxRate, thbUnitCostRaw } = params
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
    const explicitThb = parseNonNegativeMoney(thbUnitCostRaw)
    return {
      ok: true,
      unitCostThb: explicitThb != null ? roundErp3(explicitThb) : thbUnitCostFromKrw(costVal, fxRate),
      sourceUnitCost: roundErp3(costVal),
    }
  }

  return { ok: true, unitCostThb: roundErp3(costVal), sourceUnitCost: null }
}

export type InboundKrwWeightLine = {
  qty: number
  krwUnit: number
}

export type InboundThbAllocLine = {
  /** 수량 × 원화 단가 (소수 3자리) */
  krwAmount: number
  /** 기록되는 바트 단가 */
  thbUnit: number
  /** roundErp3(수량 × 바트 단가) */
  thbAmount: number
}

/**
 * 원화 금액(수량×단가) 비율로 바트 공급가 총액을 줄에 나눈 결과.
 * appliedThb 는 입고 공급가 합계(소수 2자리 누적)와 같은 기준.
 */
export type InboundThbAllocation = {
  fxRate: number
  /** 입력 총액을 소수 2자리로 맞춘 값 */
  requestedThb: number
  /** 단가 반올림 후 실제로 기록되는 공급가 합계 */
  appliedThb: number
  totalKrw: number
  lines: InboundThbAllocLine[]
}

function lineNetFromUnitMilli(qty: number, unitMilli: number): number {
  return roundErp3(qty * (unitMilli / 1000))
}

/** 입고 배치 공급가와 동일 — 줄 금액을 더할 때마다 소수 2자리 */
function sumInboundSupply2(nets: number[]): number {
  let netTotal = 0
  for (const net of nets) netTotal = roundMoney2(netTotal + net)
  return netTotal
}

function closestUnitMilli(qty: number, targetNet: number): number {
  if (!(qty > 0) || !(targetNet > 0)) return 0
  const approx = Math.max(0, Math.round((targetNet / qty) * 1000))
  let best = approx
  let bestDiff = Math.abs(lineNetFromUnitMilli(qty, approx) - targetNet)
  if (bestDiff < 0.0005) return best
  const window = Math.min(4000, Math.max(40, Math.ceil(2 / qty) + 12))
  for (let d = 1; d <= window; d++) {
    for (const c of [approx + d, approx - d]) {
      if (c < 0) continue
      const diff = Math.abs(lineNetFromUnitMilli(qty, c) - targetNet)
      if (diff < bestDiff - 1e-9) {
        bestDiff = diff
        best = c
        if (bestDiff < 0.0005) return best
      }
    }
  }
  return best
}

function allocateCentsByWeight(weights: number[], targetCents: number): number[] | null {
  const totalW = weights.reduce((sum, w) => sum + w, 0)
  if (!(totalW > 0) || targetCents <= 0) return null
  const raw = weights.map((w) => (targetCents * w) / totalW)
  const alloc = raw.map((x) => Math.floor(x + 1e-8))
  let remain = targetCents - alloc.reduce((sum, n) => sum + n, 0)
  const order = raw
    .map((x, i) => ({ i, frac: x - Math.floor(x + 1e-8), w: weights[i] }))
    .filter((row) => row.w > 0)
    .sort((a, b) => b.frac - a.frac || a.i - b.i)
  if (!order.length) return null
  let k = 0
  while (remain > 0 && k < targetCents + order.length) {
    alloc[order[k % order.length].i] += 1
    remain -= 1
    k += 1
  }
  return alloc
}

function improveUnitsTowardSupply(
  qtys: number[],
  unitMillis: number[],
  targetCents: number
): number[] {
  const units = unitMillis.slice()
  for (let iter = 0; iter < 400; iter++) {
    const nets = units.map((u, i) => lineNetFromUnitMilli(qtys[i], u))
    const gapCents = targetCents - Math.round(sumInboundSupply2(nets) * 100)
    if (gapCents === 0) break
    const dir = gapCents > 0 ? 1 : -1
    let best: { i: number; unit: number; gap: number } | null = null
    for (let i = 0; i < units.length; i++) {
      if (!(qtys[i] > 0)) continue
      for (let step = 1; step <= 15; step++) {
        const next = units[i] + dir * step
        if (next < 0) break
        const nextNet = lineNetFromUnitMilli(qtys[i], next)
        if (nextNet === nets[i]) continue
        const nextNets = nets.slice()
        nextNets[i] = nextNet
        const nextGap = Math.abs(targetCents - Math.round(sumInboundSupply2(nextNets) * 100))
        if (nextGap < Math.abs(gapCents) && (!best || nextGap < best.gap)) {
          best = { i, unit: next, gap: nextGap }
        }
      }
    }
    if (!best) break
    units[best.i] = best.unit
    if (best.gap === 0) break
  }
  return units
}

/**
 * 여러 품목의 원화(수량×단가) 비율로 바트 공급가 총액을 나눈다.
 * 줄 금액 합이 입력 총액(소수 2자리)과 같도록 단가를 맞추고, 수량이 안 나누어떨어지면 가장 가깝게 맞춘다.
 */
export function allocateInboundThbByKrwLines(
  lines: InboundKrwWeightLine[],
  totalThb: number
): InboundThbAllocation | null {
  if (!lines.length || !Number.isFinite(totalThb) || totalThb <= 0) return null
  const parsed = lines.map((line) => ({
    qty: Number(line.qty),
    krwUnit: Number(line.krwUnit),
  }))
  if (parsed.some((line) => !Number.isFinite(line.qty) || line.qty <= 0)) return null
  if (parsed.some((line) => !Number.isFinite(line.krwUnit) || line.krwUnit < 0)) return null
  const weights = parsed.map((line) => line.qty * line.krwUnit)
  const totalKrw = weights.reduce((sum, w) => sum + w, 0)
  if (!(totalKrw > 0)) return null

  const requestedThb = roundMoney2(totalThb)
  const targetCents = Math.round(requestedThb * 100)
  if (targetCents <= 0) return null
  const cents = allocateCentsByWeight(weights, targetCents)
  if (!cents) return null

  const roughUnits = parsed.map((line, i) => closestUnitMilli(line.qty, cents[i] / 100))
  const units = improveUnitsTowardSupply(
    parsed.map((line) => line.qty),
    roughUnits,
    targetCents
  )
  const thbAmounts = parsed.map((line, i) => lineNetFromUnitMilli(line.qty, units[i]))
  const appliedThb = sumInboundSupply2(thbAmounts)
  const fxBase = appliedThb > 0 ? appliedThb : requestedThb
  const fxRate = roundInboundFxRate(totalKrw / fxBase)
  if (!Number.isFinite(fxRate) || fxRate <= 0) return null

  return {
    fxRate,
    requestedThb,
    appliedThb,
    totalKrw,
    lines: parsed.map((line, i) => ({
      krwAmount: roundErp3(line.qty * line.krwUnit),
      thbUnit: units[i] / 1000,
      thbAmount: thbAmounts[i],
    })),
  }
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
