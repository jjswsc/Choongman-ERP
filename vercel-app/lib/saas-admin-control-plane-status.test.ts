import { describe, expect, it } from 'vitest'
import { resolveTenantStatus } from '@/lib/saas-admin-control-plane'

describe('resolveTenantStatus', () => {
  it('honors explicit suspended', () => {
    expect(resolveTenantStatus({ explicitStatus: 'suspended' })).toBe('suspended')
    expect(resolveTenantStatus({ explicitStatus: 'cancelled' })).toBe('suspended')
  })

  it('stays active before next billing', () => {
    expect(
      resolveTenantStatus({
        nextBillingYmd: '2026-08-01',
        nowBangkokYmd: '2026-07-15',
        lastPaymentStatus: 'paid',
      })
    ).toBe('active')
  })

  it('enters grace then suspends after grace', () => {
    expect(
      resolveTenantStatus({
        nextBillingYmd: '2026-07-01',
        overdueGraceDays: 7,
        autoSuspendOnOverdue: true,
        nowBangkokYmd: '2026-07-05',
      })
    ).toBe('grace')
    expect(
      resolveTenantStatus({
        nextBillingYmd: '2026-07-01',
        overdueGraceDays: 7,
        autoSuspendOnOverdue: true,
        nowBangkokYmd: '2026-07-10',
      })
    ).toBe('suspended')
  })

  it('does not auto-suspend when disabled', () => {
    expect(
      resolveTenantStatus({
        nextBillingYmd: '2026-07-01',
        overdueGraceDays: 0,
        autoSuspendOnOverdue: false,
        nowBangkokYmd: '2026-08-01',
      })
    ).toBe('active')
  })
})
