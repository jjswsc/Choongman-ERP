import { describe, expect, it } from 'vitest'
import { isHqAccountingStoreRow } from '@/lib/accounting-reports'

describe('isHqAccountingStoreRow', () => {
  it('matches HQ store codes used on bank_accounts (permissions isOfficeStore)', () => {
    expect(isHqAccountingStoreRow('HQ')).toBe(true)
    expect(isHqAccountingStoreRow('hq')).toBe(true)
    expect(isHqAccountingStoreRow('본사')).toBe(true)
    expect(isHqAccountingStoreRow('Office')).toBe(true)
    expect(isHqAccountingStoreRow('Office-Accounting')).toBe(true)
    expect(isHqAccountingStoreRow('Head Office')).toBe(true)
  })

  it('does not match franchise stores', () => {
    expect(isHqAccountingStoreRow('CM Huamak')).toBe(false)
    expect(isHqAccountingStoreRow('')).toBe(false)
  })
})
