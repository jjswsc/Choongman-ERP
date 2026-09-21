import { describe, expect, it } from 'vitest'
import {
  buildHeadOfficeLookupFilters,
  emptyHeadOfficeSettings,
  HQ_VENDOR_CODE,
  isHeadOfficeCodeUniqueError,
  toInvoiceHeadOfficeCompany,
  toSettingsHeadOfficeInfo,
  type HeadOfficeVendorRow,
} from '@/lib/head-office-vendor'
import { HEAD_OFFICE_DEFAULTS } from '@/lib/head-office-defaults'
import type { InventoryTenantScope } from '@/lib/inventory-tenant-scope'

const omni: InventoryTenantScope = { enforce: true, tenantId: 'marubkk' }
const choongman: InventoryTenantScope = { enforce: false, tenantId: '' }

const sampleRow: HeadOfficeVendorRow = {
  id: 11,
  code: HQ_VENDOR_CODE,
  type: '본사',
  name: 'บริษัท เออ วินเดอร์ โฟรแซ จำกัด (สำนักงาน)',
  tax_id: '0105562142456',
  addr: '98/317',
  phone: '086-359-7617',
  memo: 'Krungthai NEXT',
  tenant_id: 'abc-company',
}

describe('buildHeadOfficeLookupFilters', () => {
  it('scopes Omni lookups to tenant_id', () => {
    expect(buildHeadOfficeLookupFilters(omni)).toEqual([
      `code=eq.${HQ_VENDOR_CODE}&tenant_id=eq.marubkk`,
      'type=eq.본사&tenant_id=eq.marubkk',
      'type=eq.Head Office&tenant_id=eq.marubkk',
    ])
  })

  it('keeps Choongman lookups global', () => {
    expect(buildHeadOfficeLookupFilters(choongman)).toEqual([
      `code=eq.${HQ_VENDOR_CODE}`,
      'type=eq.본사',
      'type=eq.Head Office',
    ])
  })
})

describe('toSettingsHeadOfficeInfo', () => {
  it('returns this tenant row as-is on Omni', () => {
    expect(toSettingsHeadOfficeInfo(sampleRow, omni)).toEqual({
      companyName: sampleRow.name,
      taxId: sampleRow.tax_id,
      address: sampleRow.addr,
      phone: sampleRow.phone,
      bankInfo: sampleRow.memo,
    })
  })

  it('does not fill S&J defaults when Omni has no HQ row', () => {
    expect(toSettingsHeadOfficeInfo(null, omni)).toEqual(emptyHeadOfficeSettings())
  })

  it('fills Choongman defaults when the legacy HQ row is missing', () => {
    const info = toSettingsHeadOfficeInfo(null, choongman)
    expect(info.companyName).toBe(HEAD_OFFICE_DEFAULTS.companyName)
    expect(info.taxId).toBe(HEAD_OFFICE_DEFAULTS.taxId)
  })
})

describe('toInvoiceHeadOfficeCompany', () => {
  it('does not copy another tenant or S&J onto Omni invoices', () => {
    expect(toInvoiceHeadOfficeCompany(null, omni)).toEqual({
      companyName: '',
      address: '',
      taxId: '',
      phone: '',
    })
  })
})

describe('isHeadOfficeCodeUniqueError', () => {
  it('detects global vendors_code_key collisions', () => {
    expect(
      isHeadOfficeCodeUniqueError(
        'duplicate key value violates unique constraint "vendors_code_key"'
      )
    ).toBe(true)
    expect(isHeadOfficeCodeUniqueError('ok')).toBe(false)
  })
})
