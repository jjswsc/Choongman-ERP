import { canManageOfficePayroll, type OfficePayrollAuth } from '@/lib/office-payroll-access'
import { roundReceivableMoney } from '@/lib/bank-receivable-link'

/** 소액 차액 자동 허용 한도(바트) — VAT 반올림·정수 송금 등 */
export const RECEIVABLE_BANK_LINK_SMALL_MISMATCH_TOLERANCE = 1

export type ReceivableBankLinkMismatchKind = 'exact' | 'small' | 'large'

export type ReceivableBankLinkMismatchReason =
  | 'rounding_whole_baht'
  | 'bank_fee'
  | 'prior_overpay_offset'
  | 'other'

export const RECEIVABLE_BANK_LINK_MISMATCH_REASONS: ReceivableBankLinkMismatchReason[] = [
  'rounding_whole_baht',
  'bank_fee',
  'prior_overpay_offset',
  'other',
]

/** Director 또는 오피스 급여 담당(employees.can_manage_office_payroll) */
export function canApproveReceivableBankMismatch(auth: OfficePayrollAuth): boolean {
  return canManageOfficePayroll(auth)
}

/** 선택 합계 − 통장 − 적용 크레딧 (양수 = 부족, 음수 = 통장·크레딧이 더 큼) */
export function computeReceivableLinkGap(
  bankAmt: number,
  selectedTotal: number,
  storeCreditApply = 0
): number {
  return roundReceivableMoney(selectedTotal - bankAmt - storeCreditApply)
}

export function classifyReceivableBankLinkMismatch(
  bankAmt: number,
  selectedTotal: number,
  storeCreditApply = 0
): { kind: ReceivableBankLinkMismatchKind; gap: number } {
  const gap = computeReceivableLinkGap(bankAmt, selectedTotal, storeCreditApply)
  if (Math.abs(gap) <= 0.01) return { kind: 'exact', gap }
  if (Math.abs(gap) <= RECEIVABLE_BANK_LINK_SMALL_MISMATCH_TOLERANCE) return { kind: 'small', gap }
  return { kind: 'large', gap }
}

export function validateReceivableBankLinkRequest(params: {
  bankAmt: number
  selectedTotal: number
  storeCreditApply: number
  mismatchNote?: string
  mismatchReason?: string
  canApproveMismatch: boolean
}): { ok: true; kind: ReceivableBankLinkMismatchKind; gap: number } | { ok: false; message: string } {
  const { kind, gap } = classifyReceivableBankLinkMismatch(
    params.bankAmt,
    params.selectedTotal,
    params.storeCreditApply
  )

  if (kind === 'exact') return { ok: true, kind, gap }

  if (gap < -0.01) {
    // 통장·크레딧이 인보이스 합보다 큼 — 인보이스 전액 수금 후 통장 잔여 허용
    if (kind === 'small') return { ok: true, kind, gap }
    const note = String(params.mismatchNote || '').trim()
    if (!note) {
      return { ok: false, message: '통장·크레딧 합계가 선택 합계보다 큽니다. 차액 사유(หมายเหตุ)를 입력하세요.' }
    }
    return { ok: true, kind, gap }
  }

  // 부족분 (gap > 0)
  if (kind === 'small') {
    const reason = String(params.mismatchReason || '').trim()
    if (!reason) {
      return { ok: false, message: '소액 차액은 사유를 선택하세요.' }
    }
    return { ok: true, kind, gap }
  }

  const note = String(params.mismatchNote || '').trim()
  if (!note) {
    return { ok: false, message: '차액이 큽니다. หมายเหตุ(사유)를 입력하세요.' }
  }
  if (!params.canApproveMismatch) {
    return {
      ok: false,
      message: '차액 연결은 Director 또는 오피스 급여 담당자 승인이 필요합니다.',
    }
  }
  return { ok: true, kind, gap }
}
