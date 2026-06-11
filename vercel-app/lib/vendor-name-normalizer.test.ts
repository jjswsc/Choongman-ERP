import { describe, expect, it } from 'vitest'
import { buildVendorFilterAliasesFromRows } from './vendor-name-normalizer'

function mockResolver(rows: { code?: string; name?: string }[]) {
  const codeToName = new Map<string, string>()
  const nameCanonical = new Map<string, string>()
  for (const row of rows) {
    const code = String(row.code || '').trim()
    const name = String(row.name || '').trim()
    if (code) codeToName.set(code.toLowerCase(), name)
    if (name) nameCanonical.set(name.toLowerCase(), name)
  }
  return (raw: string) => {
    const value = String(raw || '').trim()
    if (!value) return ''
    return codeToName.get(value.toLowerCase()) || nameCanonical.get(value.toLowerCase()) || value
  }
}

describe('buildVendorFilterAliasesFromRows', () => {
  const vendorRows = [
    { code: 'cml-global', name: 'CML Global', gps_name: '', sales_outlet: '' },
    { code: 'other', name: 'Other Vendor', gps_name: '', sales_outlet: '' },
  ]
  const resolve = mockResolver(vendorRows)

  it('matches vendor filter by display name (dropdown value)', () => {
    const aliases = buildVendorFilterAliasesFromRows('CML Global', vendorRows, resolve)
    expect(aliases.has('CML Global')).toBe(true)
  })

  it('matches vendor filter by vendor code', () => {
    const aliases = buildVendorFilterAliasesFromRows('cml-global', vendorRows, resolve)
    expect(aliases.has('CML Global')).toBe(true)
  })

  it('falls back to raw filter when vendor is not in master (history-only name)', () => {
    const aliases = buildVendorFilterAliasesFromRows('Legacy Vendor', vendorRows, resolve)
    expect(aliases.has('Legacy Vendor')).toBe(true)
  })
})
