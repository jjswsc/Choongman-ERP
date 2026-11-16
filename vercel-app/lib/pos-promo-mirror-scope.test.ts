import { describe, expect, it } from 'vitest'
import { normalizeMenuScopeStoreCodes } from '@/lib/pos-menu-store-scope'

/** resolvePromoMirrorStoreCodesForSave 의 명시 분기 — DB 없이 회귀 방지 */
function resolveExplicitPromoMirrorStoreCodes(params: {
  hasExplicitStoreCodes: boolean
  explicitStoreCodes?: unknown
  inheritedStoreCodes?: string[]
}): { storeCodes: string[]; shouldSync: boolean } {
  if (params.hasExplicitStoreCodes) {
    return {
      storeCodes: normalizeMenuScopeStoreCodes(params.explicitStoreCodes),
      shouldSync: true,
    }
  }
  const inherited = normalizeMenuScopeStoreCodes(params.inheritedStoreCodes || [])
  if (inherited.length > 0) {
    return { storeCodes: inherited, shouldSync: true }
  }
  return { storeCodes: [], shouldSync: false }
}

describe('promo mirror store scope save plan', () => {
  it('syncs even when explicit storeCodes is empty (clear scopes)', () => {
    expect(
      resolveExplicitPromoMirrorStoreCodes({
        hasExplicitStoreCodes: true,
        explicitStoreCodes: [],
      })
    ).toEqual({ storeCodes: [], shouldSync: true })
  })

  it('syncs explicit store codes', () => {
    expect(
      resolveExplicitPromoMirrorStoreCodes({
        hasExplicitStoreCodes: true,
        explicitStoreCodes: ['Jayle', ' Rama9 ', 'Jayle'],
      })
    ).toEqual({ storeCodes: ['Jayle', 'Rama9'], shouldSync: true })
  })

  it('falls back to inherited component scopes when not explicit', () => {
    expect(
      resolveExplicitPromoMirrorStoreCodes({
        hasExplicitStoreCodes: false,
        inheritedStoreCodes: ['Jayle'],
      })
    ).toEqual({ storeCodes: ['Jayle'], shouldSync: true })
  })

  it('does not sync when neither explicit nor inherited (keep existing)', () => {
    expect(
      resolveExplicitPromoMirrorStoreCodes({
        hasExplicitStoreCodes: false,
        inheritedStoreCodes: [],
      })
    ).toEqual({ storeCodes: [], shouldSync: false })
  })
})
