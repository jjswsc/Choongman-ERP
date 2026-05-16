import { describe, expect, it } from 'vitest'
import {
  countWhtPayeeTinGaps,
  evaluateStoreTaxLink,
  findVendorsMatchingStore,
  storesLinkedToVendor,
  vendorMatchesStore,
} from '@/lib/store-vendor-tax-link'

describe('store-vendor-tax-link', () => {
  const vendors = [
    { code: 'V001', name: 'Franchise A Co', tax_no: '1234567890123', sales_outlet: 'STORE01', gps_name: '' },
    { code: 'V002', name: 'HQ Supplier', tax_no: '9876543210987', sales_outlet: '', gps_name: 'Silom' },
  ]

  it('matches store by sales_outlet', () => {
    expect(vendorMatchesStore(vendors[0], 'STORE01')).toBe(true)
    expect(findVendorsMatchingStore('STORE01', vendors).map((v) => v.code)).toEqual(['V001'])
  })

  it('matches store by gps_name', () => {
    expect(vendorMatchesStore(vendors[1], 'Silom')).toBe(true)
  })

  it('evaluates explicit vendor_code as linked', () => {
    const ev = evaluateStoreTaxLink(
      'STORE01',
      { storeCode: 'STORE01', vendorCode: 'V001', taxpayerName: '', taxId: '' },
      vendors
    )
    expect(ev.status).toBe('linked')
    expect(ev.vendorCode).toBe('V001')
    expect(ev.taxId).toBe('1234567890123')
  })

  it('evaluates sales_outlet without profile vendor as inferred', () => {
    const ev = evaluateStoreTaxLink('STORE01', { storeCode: 'STORE01' }, vendors)
    expect(ev.status).toBe('inferred')
    expect(ev.matchVia).toBe('sales_outlet')
  })

  it('lists stores for vendor', () => {
    const links = storesLinkedToVendor(vendors[0], ['STORE01', 'STORE02'], [
      { storeCode: 'STORE01', vendorCode: 'V001' },
    ])
    expect(links).toEqual([{ storeCode: 'STORE01', via: 'vendor_code' }])
  })

  it('counts WHT rows missing payee TIN', () => {
    const rows = [
      { payee_tax_id: '1234567890123', store_name: 'STORE01' },
      { payee_tax_id: '', store_name: 'STORE01' },
      { payee_tax_id: '123', store_name: 'STORE02' },
    ]
    expect(countWhtPayeeTinGaps(rows, 'All')).toBe(2)
    expect(countWhtPayeeTinGaps(rows, 'STORE01')).toBe(1)
  })
})
