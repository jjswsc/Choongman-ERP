export function clampNonNegativeMinutes(value: number): number {
  if (!Number.isFinite(value)) return 0
  return Math.max(0, Math.min(9999, Math.round(value)))
}

export function hasValidMinutesInput(value: number | null | undefined): boolean {
  return value != null && Number.isFinite(Number(value)) && Number(value) >= 0
}

export function shouldRecordAdjustment(beforeValue: number, afterValue: number, wasRequested: boolean): boolean {
  return beforeValue !== afterValue || wasRequested
}

export function resolveClockInApprovalLate(
  beforeLate: number,
  opts: { waiveLate: boolean; optLateMinutes?: number | null }
): { afterLate: number; status: '정상(승인)' | '지각(승인)'; requested: boolean } {
  const requested = opts.waiveLate || hasValidMinutesInput(opts.optLateMinutes)
  const afterLate = opts.waiveLate
    ? 0
    : hasValidMinutesInput(opts.optLateMinutes)
      ? clampNonNegativeMinutes(Number(opts.optLateMinutes))
      : clampNonNegativeMinutes(beforeLate)
  const status: '정상(승인)' | '지각(승인)' = afterLate > 0 ? '지각(승인)' : '정상(승인)'
  return { afterLate, status, requested }
}

export function resolveEarlyExplicitForPayroll(params: {
  outApproved: boolean
  outStatus: string
  rawEarlyNum: number | null
  hasEarlyAdjustment: boolean
}): number | null {
  if (!params.outApproved) return null
  if (!String(params.outStatus || '').includes('정상(승인)')) return null
  if (params.rawEarlyNum == null || !Number.isFinite(Number(params.rawEarlyNum))) return null
  const n = clampNonNegativeMinutes(Number(params.rawEarlyNum))
  return n > 0 || params.hasEarlyAdjustment ? n : null
}

export function computeDayEarlyMinutes(params: {
  plannedWorkMin: number
  diffMin: number
  outApproved: boolean
  outStatus: string
  earlyMinExplicit: number | null
}): number {
  if (params.plannedWorkMin <= 0) return 0
  const computedEarly = params.diffMin < 0 ? Math.abs(params.diffMin) : 0
  const useDbEarly =
    params.outApproved &&
    String(params.outStatus || '').includes('정상(승인)') &&
    params.diffMin < 0 &&
    params.earlyMinExplicit != null &&
    Number.isFinite(params.earlyMinExplicit)
  if (useDbEarly) {
    return Math.min(clampNonNegativeMinutes(Number(params.earlyMinExplicit)), computedEarly)
  }
  return Math.max(0, -params.diffMin)
}
