import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import { posTableLayoutCacheKey } from '@/lib/api-client/pos-table-printer'

describe('posTableLayoutCacheKey', () => {
  const originalSession = globalThis.sessionStorage

  beforeEach(() => {
    const store = new Map<string, string>()
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v)
      },
      removeItem: (k: string) => {
        store.delete(k)
      },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (originalSession) vi.stubGlobal('sessionStorage', originalSession)
  })

  it('includes tenant so shared store codes do not share layout cache', () => {
    sessionStorage.setItem('cm_tenant_id', 'banjoo')
    expect(posTableLayoutCacheKey('1000')).toBe('erp:posTableLayout:t:banjoo:1000')
  })

  it('falls back without tenant when session is empty', () => {
    expect(posTableLayoutCacheKey('1000')).toBe('erp:posTableLayout:1000')
  })
})
