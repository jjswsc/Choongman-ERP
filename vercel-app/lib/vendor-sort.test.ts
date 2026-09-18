import { describe, expect, it } from 'vitest'
import {
  applyVendorColumnFilters,
  compareVendorsByDisplayName,
  sortVendorListRows,
  sortVendorNameStrings,
  sortVendorsByDisplayName,
  uniqueVendorColumnOptions,
  vendorColumnOptionRows,
  vendorListDisplayName,
} from './vendor-sort'

describe('vendor-sort', () => {
  it('sorts vendors by display name then code', () => {
    const input = [
      { code: 'V003', name: 'Sun Food International Co.,Ltd.' },
      { code: 'V001', name: 'CML Global Co.,Ltd.' },
      { code: 'V002', name: 'ADVANCED MPAY COMPANY LIMITED' },
    ]
    expect(sortVendorsByDisplayName(input).map((v) => v.name)).toEqual([
      'ADVANCED MPAY COMPANY LIMITED',
      'CML Global Co.,Ltd.',
      'Sun Food International Co.,Ltd.',
    ])
  })

  it('uses code as tiebreaker for identical names', () => {
    expect(
      compareVendorsByDisplayName({ code: 'B02', name: 'Same Co.' }, { code: 'A01', name: 'Same Co.' })
    ).toBeGreaterThan(0)
  })

  it('sorts vendor name strings', () => {
    expect(sortVendorNameStrings(['Zeta', 'Alpha', 'Beta'])).toEqual(['Alpha', 'Beta', 'Zeta'])
  })

  it('uses gps_name for sales vendors in the list', () => {
    expect(
      vendorListDisplayName({
        code: 'V004',
        name: 'B2S COMPANY LIMITED',
        type: 'sales',
        gps_name: 'บีทูเอส จำกัด',
      })
    ).toBe('บีทูเอส จำกัด')
  })

  it('sorts vendor list by code, type label, then displayed name', () => {
    const rows = [
      { code: 'V010', name: 'Zebra', type: 'purchase' as const },
      { code: 'V002', name: 'Alpha', type: 'sales' as const },
      { code: 'V004', name: 'Mid', type: 'purchase' as const },
    ]
    const typeLabel = (type: string) => (type === 'sales' ? 'Sales' : 'Supplier')
    expect(sortVendorListRows(rows, 'code', 'asc').map((v) => v.code)).toEqual(['V002', 'V004', 'V010'])
    expect(sortVendorListRows(rows, 'name', 'asc').map((v) => v.name)).toEqual(['Alpha', 'Mid', 'Zebra'])
    expect(sortVendorListRows(rows, 'type', 'asc', typeLabel).map((v) => v.code)).toEqual(['V002', 'V004', 'V010'])
    expect(sortVendorListRows(rows, 'name', 'desc').map((v) => v.name)).toEqual(['Zebra', 'Mid', 'Alpha'])
  })

  it('filters vendor list by selected column values', () => {
    const rows = [
      { code: 'V010', name: 'Zebra', type: 'purchase' as const },
      { code: 'V002', name: 'Alpha', type: 'sales' as const },
      { code: 'V004', name: 'Mid', type: 'purchase' as const },
    ]
    expect(
      applyVendorColumnFilters(rows, { type: new Set(['purchase']) }).map((v) => v.code)
    ).toEqual(['V010', 'V004'])
    expect(
      applyVendorColumnFilters(rows, { code: new Set(['V002', 'V004']) }).map((v) => v.code)
    ).toEqual(['V002', 'V004'])
    expect(applyVendorColumnFilters(rows, { name: new Set(['Zebra']) }).map((v) => v.name)).toEqual(['Zebra'])
    expect(applyVendorColumnFilters(rows, { type: new Set() })).toEqual([])
  })

  it('builds unique filter options from other-column-filtered rows', () => {
    const rows = [
      { code: 'V010', name: 'Zebra', type: 'purchase' as const },
      { code: 'V002', name: 'Alpha', type: 'sales' as const },
      { code: 'V004', name: 'Mid', type: 'purchase' as const },
    ]
    const typeLabel = (type: string) => (type === 'sales' ? 'Sales' : 'Supplier')
    const filteredRows = vendorColumnOptionRows(rows, { type: new Set(['purchase']) }, 'code')
    expect(uniqueVendorColumnOptions(filteredRows, 'code').map((o) => o.value)).toEqual(['V004', 'V010'])
    expect(uniqueVendorColumnOptions(rows, 'type', typeLabel).map((o) => o.label)).toEqual(['Sales', 'Supplier'])
  })
})
