import { describe, expect, it } from 'vitest'
import { resolveErpStoreIdentitySync } from '@/lib/erp-store-identity'
import type { ErpStoreMasterRow } from '@/lib/erp-store-master'

const THE_STREET_MASTER: ErpStoreMasterRow = {
  store_code: 'CM The street',
  display_name: 'CM The street',
  aliases: ['1050', 'CM The street', 'CM The Street', 'CM The Street Ratchada', 'The Street Ratchada'],
}

describe('resolveErpStoreIdentitySync — The Street canonical', () => {
  it('maps CM The Street alias to canonical CM The street', () => {
    const id = resolveErpStoreIdentitySync('CM The Street', [THE_STREET_MASTER], {})
    expect(id.fromMaster).toBe(true)
    expect(id.storeCode).toBe('CM The street')
  })

  it('maps CM The Street Ratchada alias to canonical CM The street', () => {
    const id = resolveErpStoreIdentitySync('CM The Street Ratchada', [THE_STREET_MASTER], {})
    expect(id.storeCode).toBe('CM The street')
  })

  it('keeps canonical CM The street unchanged', () => {
    const id = resolveErpStoreIdentitySync('CM The street', [THE_STREET_MASTER], {})
    expect(id.storeCode).toBe('CM The street')
  })
})
