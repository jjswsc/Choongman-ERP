import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  resolveDefaultReceiptLogoPath,
  resolveDefaultReceiptLogoUrl,
} from '@/lib/pos-receipt-default-logo'

describe('resolveDefaultReceiptLogoUrl', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.restoreAllMocks()
  })

  it('returns Choongman company-stamp on Choongman origin', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_BRAND', 'choongman')
    expect(resolveDefaultReceiptLogoUrl('https://choongman-erp.vercel.app')).toBe(
      'https://choongman-erp.vercel.app/company-stamp.png'
    )
  })

  it('returns empty on Omni host even if env says choongman', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_BRAND', 'choongman')
    expect(resolveDefaultReceiptLogoUrl('https://app.omnifoodtech.com')).toBe('')
  })

  it('returns empty when brand env is Omni', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_BRAND', 'omnifoodtech')
    expect(resolveDefaultReceiptLogoUrl('https://example.com')).toBe('')
  })
})

describe('resolveDefaultReceiptLogoPath', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('is empty for Omni brand', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_BRAND', 'omnifoodtech')
    expect(resolveDefaultReceiptLogoPath()).toBe('')
  })

  it('is company-stamp for Choongman brand', () => {
    vi.stubEnv('NEXT_PUBLIC_APP_BRAND', 'choongman')
    expect(resolveDefaultReceiptLogoPath()).toBe('/company-stamp.png')
  })
})
