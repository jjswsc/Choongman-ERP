import { describe, expect, it } from 'vitest'
import {
  bankOnlyStoreCodesFromMasters,
  erpStoreMasterIsBankOnly,
  type ErpStoreMasterRow,
} from './erp-store-master-shared'

describe('bank_only erp_stores', () => {
  it('detects bank_only alias', () => {
    expect(erpStoreMasterIsBankOnly({ aliases: ['bank_only'] })).toBe(true)
    expect(erpStoreMasterIsBankOnly({ aliases: ['Asia Commerce', 'bank_only'] })).toBe(true)
    expect(erpStoreMasterIsBankOnly({ aliases: ['CM Asoke'] })).toBe(false)
    expect(erpStoreMasterIsBankOnly({ aliases: null })).toBe(false)
  })

  it('lists bank-only store codes', () => {
    const masters: ErpStoreMasterRow[] = [
      { store_code: 'CM Asoke', display_name: 'CM Asoke', aliases: [] },
      {
        store_code: 'Asia Commerce',
        display_name: 'Asia Commerce',
        aliases: ['bank_only', 'Asia Commerce & Trade Co.,Ltd.'],
      },
    ]
    expect(bankOnlyStoreCodesFromMasters(masters)).toEqual(['Asia Commerce'])
  })
})
