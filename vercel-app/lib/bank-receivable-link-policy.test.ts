import { describe, expect, it } from 'vitest'
import {
  canApproveReceivableBankMismatch,
  classifyReceivableBankLinkMismatch,
  computeReceivableLinkGap,
  validateReceivableBankLinkRequest,
} from '@/lib/bank-receivable-link-policy'

describe('bank-receivable-link-policy', () => {
  it('allows director and office payroll manager to approve mismatch', () => {
    expect(canApproveReceivableBankMismatch({ role: 'director' })).toBe(true)
    expect(canApproveReceivableBankMismatch({ role: 'accounting', canManageOfficePayroll: true })).toBe(true)
    expect(canApproveReceivableBankMismatch({ role: 'accounting' })).toBe(false)
  })

  it('classifies Phuket whole-baht rounding as small surplus', () => {
    const { kind, gap } = classifyReceivableBankLinkMismatch(5042, 5041.38)
    expect(kind).toBe('small')
    expect(gap).toBe(-0.62)
  })

  it('classifies 273 shortfall as large until credit applied', () => {
    const large = classifyReceivableBankLinkMismatch(270752.94, 271025.94)
    expect(large.kind).toBe('large')
    expect(large.gap).toBe(273)
    const exact = classifyReceivableBankLinkMismatch(270752.94, 271025.94, 273)
    expect(exact.kind).toBe('exact')
    expect(computeReceivableLinkGap(270752.94, 271025.94, 273)).toBe(0)
  })

  it('requires approval for large shortfall without credit', () => {
    const denied = validateReceivableBankLinkRequest({
      bankAmt: 270752.94,
      selectedTotal: 271025.94,
      storeCreditApply: 0,
      mismatchNote: 'March overpay offset',
      canApproveMismatch: false,
    })
    expect(denied.ok).toBe(false)

    const ok = validateReceivableBankLinkRequest({
      bankAmt: 270752.94,
      selectedTotal: 271025.94,
      storeCreditApply: 0,
      mismatchNote: 'March overpay offset',
      canApproveMismatch: true,
    })
    expect(ok.ok).toBe(true)
  })
})
