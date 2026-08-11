import { isKbankQrEnabledForStore, isKbankQrPilotStoreLabel } from '@/lib/kbank-pilot-stores'
import { lookupChoongmanKbankStoreDefaults } from '@/lib/kbank-store-merchant-defaults'
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

  it('allows Huamak / Seacon', () => {
    expect(isKbankQrEnabledForStore({ storeId: 'CM Huamak' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeLabel: 'CHOONGMAN HUAMAK' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeId: 'CM Seacon Square' })).toBe(true)
    expect(isKbankQrEnabledForStore({ storeName: 'SEACON' })).toBe(true)
  })

  it('rejects unrelated stores', () => {
    expect(isKbankQrEnabledForStore({ storeId: 'CM Silom' })).toBe(false)
    expect(isKbankQrPilotStoreLabel('jayle')).toBe(false)
    expect(isKbankQrPilotStoreLabel('huama')).toBe(false)
  })
})

describe('choongman kbank store MID defaults', () => {
  it('maps Huamak / Seacon codes to bank MIDs', () => {
    expect(lookupChoongmanKbankStoreDefaults('CM Huamak')?.merchantId).toBe('KB000002340300')
    expect(lookupChoongmanKbankStoreDefaults('CM Huamak')?.partnerShopId).toBe('SJGLB00007')
    expect(lookupChoongmanKbankStoreDefaults('CM Seacon Srinakarin')?.merchantId).toBe(
      'KB000002340299'
    )
    expect(lookupChoongmanKbankStoreDefaults('CM Seacon Srinakarin')?.partnerShopId).toBe(
      'SJGLB00006'
    )
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
