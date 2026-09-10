import { describe, expect, it } from 'vitest'
import {
  isMemberPortalPrepayStore,
  type MemberPortalPrepayConfig,
} from './member-portal-prepay-config'

function cfg(partial: Partial<MemberPortalPrepayConfig> = {}): MemberPortalPrepayConfig {
  return {
    enabled: true,
    storeCodes: new Set(),
    allPublicStores: false,
    ...partial,
  }
}

describe('isMemberPortalPrepayStore', () => {
  it('returns false when prepay is off', () => {
    expect(
      isMemberPortalPrepayStore(
        { storeCode: 'CM Asoke', displayName: 'CM Asoke' },
        cfg({ enabled: false, allPublicStores: true })
      )
    ).toBe(false)
  })

  it('empty store list targets office/HQ only, not franchise stores', () => {
    const officeOnly = cfg()
    expect(
      isMemberPortalPrepayStore({ storeCode: 'CM Office', displayName: 'CM Office' }, officeOnly)
    ).toBe(true)
    expect(
      isMemberPortalPrepayStore({ storeCode: 'CM Asoke', displayName: 'CM Asoke' }, officeOnly)
    ).toBe(false)
  })

  it('allPublicStores enables franchise pickup QR and skips office sandbox', () => {
    const allPublic = cfg({ allPublicStores: true })
    expect(
      isMemberPortalPrepayStore({ storeCode: 'CM Asoke', displayName: 'CM Asoke' }, allPublic)
    ).toBe(true)
    expect(
      isMemberPortalPrepayStore({ storeCode: 'CM Office', displayName: 'CM Office' }, allPublic)
    ).toBe(false)
  })

  it('explicit store codes match regardless of office/public', () => {
    const listed = cfg({ storeCodes: new Set(['cm asoke', 'cm rama 9']) })
    expect(
      isMemberPortalPrepayStore({ storeCode: 'CM Asoke', displayName: 'CM Asoke' }, listed)
    ).toBe(true)
    expect(
      isMemberPortalPrepayStore({ storeCode: 'CM Silom', displayName: 'CM Silom' }, listed)
    ).toBe(false)
  })
})
