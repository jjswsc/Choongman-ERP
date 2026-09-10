/** @vitest-environment jsdom */
import { afterEach, describe, expect, it } from 'vitest'
import {
  isPosCustomerDisplayPathname,
  resolveCustomerDisplayStoreCode,
  shouldAcceptCustomerDisplayPayload,
} from '@/lib/pos-customer-display-state'

describe('isPosCustomerDisplayPathname', () => {
  it('matches the customer display route', () => {
    expect(isPosCustomerDisplayPathname('/pos/customer-display')).toBe(true)
    expect(isPosCustomerDisplayPathname('/pos/customer-display/')).toBe(true)
    expect(isPosCustomerDisplayPathname('/pos/login')).toBe(false)
    expect(isPosCustomerDisplayPathname('/pos/terminal')).toBe(false)
  })
})

describe('shouldAcceptCustomerDisplayPayload', () => {
  const payload = {
    storeCode: 'CM Ekkamai',
    kind: 'idle' as const,
    updatedAt: '2026-09-10T00:00:00+07:00',
  }

  it('rejects empty payload', () => {
    expect(shouldAcceptCustomerDisplayPayload(null, 'CM Ekkamai')).toBe(false)
    expect(shouldAcceptCustomerDisplayPayload({ storeCode: '', kind: 'idle', updatedAt: '' }, '')).toBe(
      false
    )
  })

  it('accepts any store when the window has no store yet', () => {
    expect(shouldAcceptCustomerDisplayPayload(payload, '')).toBe(true)
  })

  it('accepts only the matching store once known', () => {
    expect(shouldAcceptCustomerDisplayPayload(payload, 'CM Ekkamai')).toBe(true)
    expect(shouldAcceptCustomerDisplayPayload(payload, 'CM Silom')).toBe(false)
  })
})

describe('resolveCustomerDisplayStoreCode', () => {
  afterEach(() => {
    window.history.replaceState({}, '', '/pos/customer-display')
    window.localStorage.removeItem('cm_last_login_snapshot')
  })

  it('prefers auth store', () => {
    expect(resolveCustomerDisplayStoreCode('CM Ekkamai')).toBe('CM Ekkamai')
  })

  it('falls back to ?store=', () => {
    window.history.replaceState({}, '', '/pos/customer-display?store=CM%20Ekkamai')
    expect(resolveCustomerDisplayStoreCode('')).toBe('CM Ekkamai')
  })

  it('falls back to login snapshot', () => {
    window.history.replaceState({}, '', '/pos/customer-display')
    window.localStorage.setItem(
      'cm_last_login_snapshot',
      JSON.stringify({ store: 'CM Silom', user: 'staff' })
    )
    expect(resolveCustomerDisplayStoreCode('')).toBe('CM Silom')
  })
})
