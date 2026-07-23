import { describe, expect, it } from 'vitest'
import {
  menuScopeIncludesStore,
  menuHasPersistedStoreScope,
  normalizeMenuScopeStoreCodes,
  resolveEffectiveMenuScopeStoreCodes,
  shouldMenuBeVisibleForStore,
  isPosMenuStoreScopeCompatibilityModeForBrand,
} from '@/lib/pos-menu-store-scope'
import { posMenusCatalogCacheKey } from '@/lib/offline/pos-catalog-offline'

describe('pos-menu-store-scope', () => {
  it('normalizes and deduplicates store scope codes', () => {
    expect(normalizeMenuScopeStoreCodes(['A', ' a ', '', null, 'B'])).toEqual(['A', 'B'])
  })

  it('matches store variants with CM prefix differences', () => {
    expect(menuScopeIncludesStore(['CM Rama9'], 'Rama9')).toBe(true)
    expect(menuScopeIncludesStore(['Rama9'], 'CM Rama9')).toBe(true)
    expect(menuScopeIncludesStore(['CM-MBK'], 'CM MBK')).toBe(true)
    expect(menuScopeIncludesStore(['cm_mbk'], 'CM MBK')).toBe(true)
    expect(menuScopeIncludesStore(['Ekkamai'], 'Asoke')).toBe(false)
  })

  it('matches tenant-prefixed synthetic store codes against operating codes', () => {
    expect(menuScopeIncludesStore(['1001'], 'malatang01:1001')).toBe(true)
    expect(menuScopeIncludesStore(['malatang01:1001'], '1001')).toBe(true)
    expect(normalizeMenuScopeStoreCodes(['malatang01:1001', '1001', 'A'])).toEqual(['1001', 'A'])
  })

  it('resolves effective scope for admin display in compatibility mode', () => {
    expect(menuHasPersistedStoreScope([])).toBe(false)
    expect(menuHasPersistedStoreScope(['A'])).toBe(true)
    expect(resolveEffectiveMenuScopeStoreCodes([], ['A', 'B'], true)).toEqual(['A', 'B'])
    expect(resolveEffectiveMenuScopeStoreCodes([], ['A', 'B'], false)).toEqual([])
    expect(resolveEffectiveMenuScopeStoreCodes(['A'], ['B'], true)).toEqual(['A'])
  })

  it('keeps unscoped menu visible only in compatibility mode', () => {
    expect(
      shouldMenuBeVisibleForStore({
        requestedStoreCode: 'Rama9',
        scopedStores: [],
        compatibilityMode: true,
        scopeSchemaReady: true,
      })
    ).toBe(true)
    expect(
      shouldMenuBeVisibleForStore({
        requestedStoreCode: 'Rama9',
        scopedStores: [],
        compatibilityMode: false,
        scopeSchemaReady: true,
      })
    ).toBe(false)
  })

  it('Omni brand disables compatibility (empty scope = not all stores)', () => {
    expect(isPosMenuStoreScopeCompatibilityModeForBrand('omnifoodtech')).toBe(false)
    expect(isPosMenuStoreScopeCompatibilityModeForBrand('choongman')).toBe(true)
    expect(resolveEffectiveMenuScopeStoreCodes([], ['A', 'B'], false)).toEqual([])
  })
})

describe('pos menu cache key by store', () => {
  it('creates global key when storeCode is empty', () => {
    expect(posMenusCatalogCacheKey('')).toBe('erp:posCatalog:menus')
  })

  it('creates scoped key when storeCode exists', () => {
    expect(posMenusCatalogCacheKey('CM Rama9')).toBe('erp:posCatalog:menus:CM Rama9')
  })
})
