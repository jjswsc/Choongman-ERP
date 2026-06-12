import {
  buildGrabStoreMapFromRows,
  kbankRuntimeFromProcessEnv,
  mergeKbankTenantConfig,
} from '@/lib/tenant-integration-resolve'
import type { StoreGrabConfig, TenantKbankConfig } from '@/lib/tenant-integration-types'
import { describe, expect, it } from 'vitest'

describe('buildGrabStoreMapFromRows', () => {
  it('maps grab merchant chain to ERP store code', () => {
    const map = buildGrabStoreMapFromRows([
      {
        storeCode: 'cm-silom',
        config: {
          grabMerchantId: '3-C_TEST',
          partnerMerchantId: '1042',
          menuMerchantId: 'GFSBPOS-204-253',
        },
      },
    ])
    expect(map['3-C_TEST']).toBe('1042')
    expect(map['1042']).toBe('cm-silom')
    expect(map['GFSBPOS-204-253']).toBe('1042')
  })
})

describe('kbank runtime merge', () => {
  it('tenant config overrides env defaults', () => {
    const base = kbankRuntimeFromProcessEnv()
    const merged = mergeKbankTenantConfig(
      base,
      {
        consumerId: 'tenant-consumer',
        partnerId: 'tenant-partner',
        merchantId: 'tenant-merchant',
        openapiBaseUrl: 'https://kbank.example.test',
      } satisfies TenantKbankConfig,
      'tenant:acme'
    )
    expect(merged.consumerId).toBe('tenant-consumer')
    expect(merged.partnerId).toBe('tenant-partner')
    expect(merged.openapiBaseUrl).toBe('https://kbank.example.test')
    expect(merged.cacheKey).toBe('tenant:acme')
  })
})

describe('store grab config shape', () => {
  it('accepts minimal store mapping', () => {
    const cfg: StoreGrabConfig = {
      grabMerchantId: '3-C',
      partnerMerchantId: '1040',
    }
    expect(cfg.partnerMerchantId).toBe('1040')
  })
})
