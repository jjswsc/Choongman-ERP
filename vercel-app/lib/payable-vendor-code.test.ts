import { describe, expect, it } from 'vitest'
import {
  isNonRetryableExpenseAccrualErrorMessage,
  resolvePayableVendorCode,
} from '@/lib/payable-vendor-code'

describe('resolvePayableVendorCode', () => {
  it('keeps auto_ tax payee codes instead of null', () => {
    expect(resolvePayableVendorCode('auto_tax_withholding')).toBe('auto_tax_withholding')
    expect(resolvePayableVendorCode('  VENDOR1  ')).toBe('VENDOR1')
  })

  it('falls back when payee is empty', () => {
    expect(resolvePayableVendorCode('')).toBe('UNASSIGNED')
    expect(resolvePayableVendorCode('  ', 'TAX_RD')).toBe('TAX_RD')
  })
})

describe('isNonRetryableExpenseAccrualErrorMessage', () => {
  it('detects supabase 23502 vendor_code failures', () => {
    expect(
      isNonRetryableExpenseAccrualErrorMessage(
        'Supabase insert failed: {"code":"23502","details":"Failing row contains (5667, null, 195.00, Expense"'
      )
    ).toBe(true)
    expect(isNonRetryableExpenseAccrualErrorMessage('network timeout')).toBe(false)
  })
})
