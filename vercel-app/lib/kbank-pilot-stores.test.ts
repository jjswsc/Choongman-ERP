import { isKbankQrEnabledForStore, isKbankQrPilotStoreLabel } from '@/lib/kbank-pilot-stores'
import {
  lookupChoongmanKbankStoreDefaults,
  credentialsBelongToOtherChoongmanStore,
  sanitizeChoongmanStoreKbankOverride,
  choongmanKbankPrinterStoreCodeCandidates,
} from '@/lib/kbank-store-merchant-defaults'
import {
  applyStoreKbankConfig,
  emptyKbankRuntime,
  kbankRuntimeFromProcessEnv,
  mergeKbankTenantConfig,
} from '@/lib/tenant-integration-resolve'
import type { StoreKbankConfig, TenantKbankConfig } from '@/lib/tenant-integration-types'
import { describe, expect, it } from 'vitest'

describe('isKbankQrEnabledForStore', () => {
  it('allows CM Office', () => {
    expect(isKbankQrEnabledForStore({ storeId: 'CM Office' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeName: 'cm_office' })).toBe(true)
  })

  it('allows Huamak / Seacon / Future Park / Ekkamai / Silom / MBK / True Digital', () => {
    expect(isKbankQrEnabledForStore({ storeId: 'CM Huamak' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeLabel: 'CHOONGMAN HUAMAK' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: 'CM Seacon Square' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeName: 'SEACON' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: 'CM Future Park' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: 'CM Ekkamai' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: 'CM Silom' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: 'CM MBK' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: '1041', storeLabel: 'MBK Center' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: 'CM True Digital' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: '1040', storeName: 'CM True Digital' })).toBe(true)
  })

  it('rejects unrelated stores', () => {
    expect(isKbankQrEnabledForStore({ storeId: 'CM Asoke' })).toBe(false)
    expect(isKbankQrPilotStoreLabel('jayle')).toBe(false)
    expect(isKbankQrPilotStoreLabel('huama')).toBe(false)
  })
})

describe('choongman kbank store MID defaults', () => {
  it('maps Huamak / Seacon / Future Park / Ekkamai / Silom / MBK / True Digital codes to bank MIDs', () => {
    expect(lookupChoongmanKbankStoreDefaults('CM Huamak')?.merchantId).toBe('KB000002340300')
    expect(lookupChoongmanKbankStoreDefaults('CM Huamak')?.partnerShopId).toBe('SJGLB00007')
    expect(lookupChoongmanKbankStoreDefaults('CM Seacon Srinakarin')?.merchantId).toBe(
      'KB000002340299'
    )
    expect(lookupChoongmanKbankStoreDefaults('CM Seacon Srinakarin')?.partnerShopId).toBe(
      'SJGLB00006'
    )
    expect(lookupChoongmanKbankStoreDefaults('CM Future Park')?.merchantId).toBe('KB000002346593')
    expect(lookupChoongmanKbankStoreDefaults('CM Future Park')?.partnerShopId).toBe('SJGLB00005')
    expect(lookupChoongmanKbankStoreDefaults('CM Ekkamai')?.merchantId).toBe('KB000002346592')
    expect(lookupChoongmanKbankStoreDefaults('CM Ekkamai')?.partnerShopId).toBe('SJGLB00004')
    expect(lookupChoongmanKbankStoreDefaults('CM Silom')?.merchantId).toBe('KB000002346591')
    expect(lookupChoongmanKbankStoreDefaults('CM Silom')?.partnerShopId).toBe('SJGLB00003')
    expect(lookupChoongmanKbankStoreDefaults('CM MBK')?.merchantId).toBe('KB000002350191')
    expect(lookupChoongmanKbankStoreDefaults('CM MBK')?.partnerShopId).toBe('SJGLB00002')
    expect(lookupChoongmanKbankStoreDefaults('1041')?.merchantId).toBe('KB000002350191')
    expect(lookupChoongmanKbankStoreDefaults('CM True Digital')?.merchantId).toBe('KB000002350190')
    expect(lookupChoongmanKbankStoreDefaults('CM True Digital')?.partnerShopId).toBe('SJGLB00011')
    expect(lookupChoongmanKbankStoreDefaults('1040')?.merchantId).toBe('KB000002350190')
    expect(lookupChoongmanKbankStoreDefaults('1040')?.partnerShopId).toBe('SJGLB00011')
    expect(choongmanKbankPrinterStoreCodeCandidates('CM True Digital')).toEqual(
      expect.arrayContaining(['CM True Digital', '1040'])
    )
  })

  it('detects another store\'s MID pasted onto MBK / True Digital', () => {
    expect(
      credentialsBelongToOtherChoongmanStore('CM MBK', 'KB000002340299', 'SJGLB00006')
    ).toBe(true)
    expect(
      credentialsBelongToOtherChoongmanStore('CM MBK', 'KB000002350191', 'SJGLB00002')
    ).toBe(false)
    expect(
      credentialsBelongToOtherChoongmanStore('CM True Digital', 'KB000002350190', 'SJGLB00011')
    ).toBe(false)
    expect(
      credentialsBelongToOtherChoongmanStore('CM True Digital', 'KB000002350191', 'SJGLB00011')
    ).toBe(true)
    expect(
      credentialsBelongToOtherChoongmanStore('CM True Digital', 'KB000002350191', 'SJGLB00002')
    ).toBe(true)
    expect(
      credentialsBelongToOtherChoongmanStore('CM MBK', 'KB000002350191', 'SJGLB00011')
    ).toBe(true)
    expect(
      credentialsBelongToOtherChoongmanStore('CM MBK', 'KB000002350190', 'SJGLB00011')
    ).toBe(true)
  })

  it('rewrites True Digital away from MBK merchant credentials', () => {
    expect(
      sanitizeChoongmanStoreKbankOverride('CM True Digital', {
        merchantId: 'KB000002350191',
        partnerShopId: 'SJGLB00011',
      })
    ).toEqual({
      merchantId: 'KB000002350190',
      partnerShopId: 'SJGLB00011',
    })
    expect(
      sanitizeChoongmanStoreKbankOverride('CM True Digital', {
        merchantId: 'KB000002350191',
        partnerShopId: 'SJGLB00002',
      })
    ).toEqual({
      merchantId: 'KB000002350190',
      partnerShopId: 'SJGLB00011',
    })
  })
})

describe('store kbank merchantId override', () => {
  it('store merchantId overrides tenant merchantId', () => {
    const base = mergeKbankTenantConfig(
      emptyKbankRuntime('tenant:cm'),
      {
        partnerId: 'PTR0000115',
        merchantId: 'KB-TENANT-FALLBACK',
      } satisfies TenantKbankConfig,
      'tenant:cm'
    )
    const storeCfg: StoreKbankConfig = {
      merchantId: 'KB000002340300',
      partnerShopId: 'SJGLB00007',
      terminalId: '26440008',
    }
    const merged = applyStoreKbankConfig(base, storeCfg)
    expect(merged.merchantId).toBe('KB000002340300')
    expect(merged.partnerShopId).toBe('SJGLB00007')
    expect(merged.partnerId).toBe('PTR0000115')
    expect(merged.terminalId).toBe('26440008')
  })

  it('env runtime exposes partnerShopId field', () => {
    const env = kbankRuntimeFromProcessEnv()
    expect('partnerShopId' in env).toBe(true)
  })
})
