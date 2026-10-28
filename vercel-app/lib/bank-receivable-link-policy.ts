import { canManageOfficePayroll, type OfficePayrollAuth } from '@/lib/office-payroll-access'
import { isAccountingRole } from '@/lib/permissions'
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

/**
 * 수동 선수금 등록 등 민감 조정.
 * 회계 · Director · 오피스 급여 담당(employees.can_manage_office_payroll)
 */
export function canApproveReceivableBankMismatch(auth: OfficePayrollAuth): boolean {
  if (isAccountingRole(String(auth.role || ''))) return true
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

/**
 * 소액(≤฿1) 부족만 반올림 흡수. 큰 부족은 부분 수금(잔액 유지) — 회계가 분할 입금을 이어서 연결.
 * 과납은 선수금 적립.
 */
export function shouldAbsorbReceivableBankLinkShortfall(
  kind: ReceivableBankLinkMismatchKind
): boolean {
  return kind === 'small'
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
    // 과납: 인보이스 전액 수금 후 잔여분은 다음 입금 상계용 선수금으로 적립
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

  // 큰 부족 = 부분 수금(잔여 미수 유지). Director 승인·차액 탕감 없음.
  void params.canApproveMismatch
  void params.mismatchNote
  return { ok: true, kind, gap }
}
