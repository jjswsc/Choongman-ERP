import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  fillSellerFromProfiles,
  parseRdSellerList,
  pickRdCompanyForSeller,
  profileFromRdCompany,
  profilesFromVendors,
  readLearnedSellerProfiles,
  rememberSellerProfiles,
} from './purchase-tax-invoice-seller-lookup'

const SELLER = '0105559082715'
const OTHER = '0107536000315'

describe('profilesFromVendors', () => {
  it('keeps the first valid TIN and name', () => {
    const rows = profilesFromVendors([
      { tax_no: SELLER, name: 'บริษัท ตัวอย่าง จำกัด' },
      { tax_no: SELLER, name: 'Duplicate' },
      { tax_no: '123', name: 'Bad' },
      { tax_no: OTHER, name: '  Other Co  ' },
    ])
    expect(rows).toEqual([
      { sellerTaxId: SELLER, sellerName: 'บริษัท ตัวอย่าง จำกัด' },
      { sellerTaxId: OTHER, sellerName: 'Other Co' },
    ])
  })
})

describe('pickRdCompanyForSeller', () => {
  it('prefers the head office branch', () => {
    const picked = pickRdCompanyForSeller(
      [
        { taxId: SELLER, name: 'A', branchNo: '00012', branchTitle: 'สาขา 12' },
        { taxId: SELLER, name: 'A HQ', branchNo: '00000', branchTitle: 'สำนักงานใหญ่' },
      ],
      SELLER
    )
    expect(picked?.name).toBe('A HQ')
  })
})

describe('parseRdSellerList', () => {
  it('reads { list } from the VAT search API', () => {
    const profile = parseRdSellerList(
      {
        success: true,
        list: [{ taxId: SELLER, name: 'บริษัท โพลาร์ แบร์ มิชชั่น จำกัด', branchNo: '0', branchTitle: 'สำนักงานใหญ่' }],
      },
      SELLER
    )
    expect(profile?.sellerName).toContain('โพลาร์')
    expect(profile?.sellerBranch).toBe('สำนักงานใหญ่')
  })

  it('returns null when TIN checksum fails', () => {
    expect(profileFromRdCompany({ taxId: '0105559082716', name: 'Bad' })).toBeNull()
  })
})

describe('fillSellerFromProfiles', () => {
  it('fills empty name and branch only', () => {
    const filled = fillSellerFromProfiles(
      { sellerTaxId: SELLER, invoiceNo: 'A', netAmount: 100 },
      [{ sellerTaxId: SELLER, sellerName: 'บริษัท ตัวอย่าง จำกัด', sellerBranch: 'สำนักงานใหญ่' }]
    )
    expect(filled.sellerName).toContain('ตัวอย่าง')
    expect(filled.sellerBranch).toBe('สำนักงานใหญ่')
  })

  it('does not overwrite an existing seller name', () => {
    const filled = fillSellerFromProfiles(
      { sellerTaxId: SELLER, sellerName: 'Keep Me', sellerBranch: 'สาขา 1' },
      [{ sellerTaxId: SELLER, sellerName: 'Other', sellerBranch: 'สำนักงานใหญ่' }]
    )
    expect(filled.sellerName).toBe('Keep Me')
    expect(filled.sellerBranch).toBe('สาขา 1')
  })
})

describe('rememberSellerProfiles', () => {
  beforeEach(() => {
    const mem: Record<string, string> = {}
    const ls = {
      getItem: (k: string) => (Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null),
      setItem: (k: string, v: string) => {
        mem[k] = String(v)
      },
      removeItem: (k: string) => {
        delete mem[k]
      },
    }
    Object.defineProperty(globalThis, 'localStorage', { value: ls, configurable: true })
    Object.defineProperty(globalThis, 'window', { value: globalThis, configurable: true })
  })

  afterEach(() => {
    try {
      localStorage.removeItem('cm_pti_seller_tin_memory')
    } catch {
      /* ignore */
    }
  })

  it('round-trips TIN to name in localStorage', () => {
    rememberSellerProfiles([{ sellerTaxId: SELLER, sellerName: 'บริษัท จำได้ จำกัด', sellerBranch: 'สำนักงานใหญ่' }])
    const learned = readLearnedSellerProfiles()
    expect(learned.some((r) => r.sellerTaxId === SELLER && r.sellerName.includes('จำได้'))).toBe(true)
  })
})
