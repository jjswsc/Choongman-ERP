import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest'
import {
  ERP_POS_CATALOG_CATEGORIES_CACHE_KEY,
  isPosCategoriesCatalogCacheKey,
  posCategoriesCatalogCacheKey,
} from '@/lib/offline/pos-catalog-offline'

describe('posCategoriesCatalogCacheKey', () => {
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
  })

  it('includes tenant so Maru and Banjoo do not share category cache', () => {
    sessionStorage.setItem('cm_tenant_id', 'banjoo')
    expect(posCategoriesCatalogCacheKey()).toBe(`${ERP_POS_CATALOG_CATEGORIES_CACHE_KEY}:t:banjoo`)
  })

  it('falls back to legacy key when session is empty', () => {
    expect(posCategoriesCatalogCacheKey()).toBe(ERP_POS_CATALOG_CATEGORIES_CACHE_KEY)
  })

  it('accepts current tenant key and legacy global key', () => {
    sessionStorage.setItem('cm_tenant_id', 'marubkk_01')
    expect(isPosCategoriesCatalogCacheKey(posCategoriesCatalogCacheKey())).toBe(true)
    expect(isPosCategoriesCatalogCacheKey(ERP_POS_CATALOG_CATEGORIES_CACHE_KEY)).toBe(true)
    expect(isPosCategoriesCatalogCacheKey(`${ERP_POS_CATALOG_CATEGORIES_CACHE_KEY}:t:banjoo`)).toBe(
      false
    )
  })
})
