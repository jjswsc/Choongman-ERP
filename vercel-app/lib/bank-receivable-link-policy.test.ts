import { describe, expect, it } from 'vitest'
import {
  canApproveReceivableBankMismatch,
  classifyReceivableBankLinkMismatch,
  computeReceivableLinkGap,
  shouldAbsorbReceivableBankLinkShortfall,
  validateReceivableBankLinkRequest,
} from '@/lib/bank-receivable-link-policy'

describe('bank-receivable-link-policy', () => {
  it('allows director, accounting, and office payroll manager for sensitive credit actions', () => {
    expect(canApproveReceivableBankMismatch({ role: 'director' })).toBe(true)
    expect(canApproveReceivableBankMismatch({ role: 'accounting' })).toBe(true)
    expect(canApproveReceivableBankMismatch({ role: 'accounting', canManageOfficePayroll: true })).toBe(
      true
    )
    expect(canApproveReceivableBankMismatch({ role: 'officer', canManageOfficePayroll: true })).toBe(
      true
    )
    expect(canApproveReceivableBankMismatch({ role: 'officer' })).toBe(false)
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

  it('allows large shortfall as partial collection without director approval', () => {
    const ok = validateReceivableBankLinkRequest({
      bankAmt: 26706.99,
      selectedTotal: 86045.12,
      storeCreditApply: 0,
      canApproveMismatch: false,
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.kind).toBe('large')
      expect(ok.gap).toBe(59338.13)
      expect(shouldAbsorbReceivableBankLinkShortfall(ok.kind)).toBe(false)
    }
  })

  it('absorbs only small shortfall', () => {
    expect(shouldAbsorbReceivableBankLinkShortfall('small')).toBe(true)
    expect(shouldAbsorbReceivableBankLinkShortfall('large')).toBe(false)
    expect(shouldAbsorbReceivableBankLinkShortfall('exact')).toBe(false)
  })

  it('allows large surplus without note or director approval', () => {
    const ok = validateReceivableBankLinkRequest({
      bankAmt: 81523.3,
      selectedTotal: 62017.2,
      storeCreditApply: 0,
      canApproveMismatch: false,
    })
    expect(ok.ok).toBe(true)
    if (ok.ok) {
      expect(ok.kind).toBe('large')
      expect(ok.gap).toBe(-19506.1)
    }
  })
})
