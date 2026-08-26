import { describe, expect, it } from 'vitest'
import {
  formatWhtAgentDisplayName,
  mergeWhtCertificatesForPrint,
  resolvePoWhtAgentStoreKey,
  resolveVendorPayeeForWht,
  resolveWhtCertificateParties,
  resolveWhtWithholdingAgentCompany,
  whtCertificateFromExpenseRegister,
  whtCertificateFromLedgerRow,
  whtCertificateFromPurchaseOrder,
} from '@/lib/wht-certificate-data'

const headOffice = {
  companyName: 'S&J GLOBAL CO., LTD. (Head Office)',
  taxId: '0105566137147',
  address: '101 true digital park',
}

describe('resolveWhtCertificateParties', () => {
  it('passes counterparty address for outbound certificates', () => {
    const parties = resolveWhtCertificateParties({
      direction: 'outbound',
      payeeName: 'True Move H',
      payeeTaxId: '0105553045044',
      payeeAddress: '18 True Tower Ratchadaphisek',
      headOffice,
    })
    expect(parties.incomeRecipient.taxId).toBe('0105553045044')
    expect(parties.incomeRecipient.address).toBe('18 True Tower Ratchadaphisek')
    expect(parties.withholdingAgent.address).toBe('101 true digital park')
  })

  it('puts head office (S&J) on top as withholding agent for outbound', () => {
    const parties = resolveWhtCertificateParties({
      direction: 'outbound',
      payeeName: 'Jinwon f&b Co.,Ltd.',
      payeeTaxId: '0105566228126',
      payeeAddress: 'True Digital Park Retail',
      headOffice,
    })
    expect(parties.withholdingAgent.name).toBe('S&J GLOBAL CO., LTD. (Head Office)')
    expect(parties.incomeRecipient.name).toBe('Jinwon f&b Co.,Ltd.')
  })
})

describe('resolveWhtWithholdingAgentCompany', () => {
  it('keeps head office when store is HQ/Office', () => {
    const agent = resolveWhtWithholdingAgentCompany({
      headOffice,
      storeName: 'Office',
      profile: { taxpayerName: 'Should Not Use', placeOfBusiness: 'Other' },
    })
    expect(agent.companyName).toBe(headOffice.companyName)
    expect(agent.address).toBe(headOffice.address)
  })

  it('appends สาขา store label and uses profile address/TIN', () => {
    const agent = resolveWhtWithholdingAgentCompany({
      headOffice,
      storeName: 'Union Mall',
      profile: {
        taxpayerName: 'S&J GLOBAL CO., LTD.',
        taxId: '0105566137147',
        placeOfBusiness: 'Union Mall, Bangkok',
        branchNo: '00001',
      },
    })
    expect(agent.companyName).toBe('S&J GLOBAL CO., LTD. (สาขา Union Mall)')
    expect(agent.address).toBe('Union Mall, Bangkok')
    expect(agent.taxId).toBe('0105566137147')
  })

  it('falls back to HQ address/TIN when profile incomplete', () => {
    const agent = resolveWhtWithholdingAgentCompany({
      headOffice,
      storeName: 'EM District',
      profile: null,
    })
    expect(agent.companyName).toBe('S&J GLOBAL CO., LTD. (สาขา EM District)')
    expect(agent.address).toBe(headOffice.address)
    expect(agent.taxId).toBe(headOffice.taxId)
  })

  it('falls back to HQ when store profile TIN matches payee (franchise clash)', () => {
    const agent = resolveWhtWithholdingAgentCompany({
      headOffice,
      storeName: 'CM Asoke',
      profile: {
        taxpayerName: 'Han Enterprise Co.,Ltd.',
        taxId: '0105553119650',
        placeOfBusiness: '',
      },
      payeeTaxId: '0105553119650',
    })
    expect(agent.companyName).toBe(headOffice.companyName)
    expect(agent.taxId).toBe(headOffice.taxId)
  })

  it('uses HQ when hqEntityBranchesOnly and profile TIN differs from HQ', () => {
    const agent = resolveWhtWithholdingAgentCompany({
      headOffice,
      storeName: 'CM Asoke',
      profile: {
        taxpayerName: 'Han Enterprise Co.,Ltd.',
        taxId: '0105553119650',
      },
      payeeTaxId: '0105553045044',
      hqEntityBranchesOnly: true,
    })
    expect(agent.companyName).toBe(headOffice.companyName)
  })
})

describe('resolvePoWhtAgentStoreKey', () => {
  it('uses issuerStore only, not relatedStore', () => {
    expect(
      resolvePoWhtAgentStoreKey({
        cart_json: {
          v: 1,
          items: [],
          meta: { issuerStore: 'Union Mall', relatedStore: 'CM Asoke' },
        },
      })
    ).toBe('Union Mall')
    expect(
      resolvePoWhtAgentStoreKey({
        cart_json: {
          v: 1,
          items: [],
          meta: { relatedStore: 'CM Asoke' },
        },
      })
    ).toBe('')
  })
})

describe('formatWhtAgentDisplayName', () => {
  it('keeps profile name when it already has สาขา', () => {
    expect(
      formatWhtAgentDisplayName({
        taxpayerName: 'S&J GLOBAL CO., LTD. (สาขา Custom)',
        headOfficeName: headOffice.companyName,
        storeLabel: 'Union Mall',
      })
    ).toBe('S&J GLOBAL CO., LTD. (สาขา Custom)')
  })
})

describe('resolveVendorPayeeForWht', () => {
  const vendors = [
    {
      code: 'TRUEH',
      name: 'บริษัท ทรู มูฟ เอช ยูนิเวอร์แซล คอมมิวนิเคชั่น จำกัด',
      taxId: '0105553045044',
      address: '18 อาคารทรู ทาวเวอร์',
    },
  ]

  it('matches by normalized Thai company name', () => {
    const found = resolveVendorPayeeForWht(
      vendors,
      '',
      'ทรู มูฟ เอช ยูนิเวอร์แซล คอมมิวนิเคชั่น จำกัด'
    )
    expect(found.taxId).toBe('0105553045044')
    expect(found.address).toContain('ทรู ทาวเวอร์')
  })

  it('matches by tax ID when the payee name is incomplete', () => {
    const found = resolveVendorPayeeForWht(vendors, '', 'ทรู', '0105553045044')
    expect(found.address).toContain('ทรู ทาวเวอร์')
  })
})

describe('whtCertificateFromPurchaseOrder', () => {
  it('puts S&J (head office) on top when PO has no issuerStore (HQ issue)', () => {
    const cert = whtCertificateFromPurchaseOrder(
      {
        po_no: 'PO-20260807',
        vendor_name: 'Han Enterprise Co.,Ltd. (00001)',
        vendor_code: 'HAN',
        total: 17514.72,
        vat: 1145.82,
        withholding_tax_amount: 491.07,
        withholding_tax_rate: 3,
        cart_json: { v: 1, items: [], meta: { orderDate: '2026-08-07', relatedStore: 'CM Asoke' } },
      },
      headOffice,
      '0105553119650',
      'No. 212/2-3, Sukhumvit Plaza'
    )
    expect(cert?.withholdingAgent.name).toBe('S&J GLOBAL CO., LTD. (Head Office)')
    expect(cert?.withholdingAgent.taxId).toBe(headOffice.taxId)
    expect(cert?.incomeRecipient.name).toBe('Han Enterprise Co.,Ltd. (00001)')
    expect(cert?.incomeRecipient.taxId).toBe('0105553119650')
  })

  it('puts selected issuer store agent on top when issuerStore is set', () => {
    const storeAgent = resolveWhtWithholdingAgentCompany({
      headOffice,
      storeName: 'Union Mall',
      profile: {
        taxpayerName: 'S&J GLOBAL CO., LTD.',
        taxId: '0105566137147',
        placeOfBusiness: 'Union Mall, Bangkok',
      },
      payeeTaxId: '0105553045044',
    })
    const cert = whtCertificateFromPurchaseOrder(
      {
        po_no: 'PO-20260808',
        vendor_name: 'True Move H',
        total: 1070,
        vat: 70,
        withholding_tax_amount: 30,
        withholding_tax_rate: 3,
        cart_json: {
          v: 1,
          items: [],
          meta: { orderDate: '2026-08-08', issuerStore: 'Union Mall', relatedStore: 'CM Asoke' },
        },
      },
      storeAgent,
      '0105553045044',
      '18 True Tower'
    )
    expect(cert?.withholdingAgent.name).toBe('S&J GLOBAL CO., LTD. (สาขา Union Mall)')
    expect(cert?.incomeRecipient.name).toBe('True Move H')
  })
})

describe('whtCertificateFromExpenseRegister', () => {
  it('includes payee address and tax id on outbound cert', () => {
    const cert = whtCertificateFromExpenseRegister(
      {
        certificateNo: 'EAW-2258',
        paymentDate: '2026-07-30',
        payeeName: 'ทรู มูฟ เอช',
        payeeTaxId: '0105553045044',
        payeeAddress: '18 อาคารทรู ทาวเวอร์',
        grossInclVat: 100,
        vatAmount: 0,
        whtRate: 3,
        whtAmount: 3,
      },
      headOffice
    )
    expect(cert?.incomeRecipient.taxId).toBe('0105553045044')
    expect(cert?.incomeRecipient.address).toContain('ทรู ทาวเวอร์')
  })

  it('uses branch agent block for store expense', () => {
    const agent = resolveWhtWithholdingAgentCompany({
      headOffice,
      storeName: 'CentralWorld',
      profile: { placeOfBusiness: 'CentralWorld address' },
    })
    const cert = whtCertificateFromExpenseRegister(
      {
        certificateNo: 'EAW-1',
        paymentDate: '2026-08-01',
        payeeName: 'Vendor',
        payeeTaxId: '0105553045044',
        grossInclVat: 100,
        vatAmount: 0,
        whtRate: 3,
        whtAmount: 3,
        storeName: 'CentralWorld',
      },
      agent
    )
    expect(cert?.withholdingAgent.name).toContain('สาขา CentralWorld')
    expect(cert?.withholdingAgent.address).toBe('CentralWorld address')
  })
})

describe('whtCertificateFromLedgerRow', () => {
  it('maps payee_address into incomeRecipient', () => {
    const cert = whtCertificateFromLedgerRow(
      {
        payment_date: '2026-07-30',
        tax_month: '2026-07',
        payee_name: 'True Move H',
        payee_tax_id: '0105553045044',
        payee_address: '18 True Tower',
        income_type: 'ค่าบริการ',
        gross_amount: 100,
        wht_amount: 3,
        direction: 'outbound',
      },
      headOffice
    )
    expect(cert.incomeRecipient.address).toBe('18 True Tower')
    expect(cert.incomeRecipient.taxId).toBe('0105553045044')
  })
})

describe('mergeWhtCertificatesForPrint', () => {
  it('merges same certificate number into one 50 ทวิ with two income lines', () => {
    const a = whtCertificateFromLedgerRow(
      {
        payment_date: '2026-08-25',
        tax_month: '2026-08',
        payee_name: 'Vendor',
        income_type: 'ค่าเช่า',
        gross_amount: 56000,
        wht_rate: 5,
        wht_amount: 2800,
        certificate_no: 'EAW-9',
        direction: 'outbound',
      },
      headOffice
    )
    const b = whtCertificateFromLedgerRow(
      {
        payment_date: '2026-08-25',
        tax_month: '2026-08',
        payee_name: 'Vendor',
        income_type: 'ค่าบริการ',
        gross_amount: 24000,
        wht_rate: 3,
        wht_amount: 720,
        certificate_no: 'EAW-9',
        direction: 'outbound',
      },
      headOffice
    )
    const merged = mergeWhtCertificatesForPrint([a, b])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.incomeLines).toHaveLength(2)
    expect(merged[0]?.whtAmount).toBe(3520)
    expect(merged[0]?.grossAmount).toBe(80000)
    expect(merged[0]?.incomeType).toBe('ค่าเช่า, ค่าบริการ')
  })

  it('does not merge rows that only share payee and date without a certificate number', () => {
    const a = whtCertificateFromLedgerRow(
      {
        payment_date: '2026-08-25',
        tax_month: '2026-08',
        payee_name: 'Vendor',
        income_type: 'ค่าเช่า',
        gross_amount: 1000,
        wht_amount: 50,
        certificate_no: '',
        direction: 'outbound',
      },
      headOffice
    )
    const b = whtCertificateFromLedgerRow(
      {
        payment_date: '2026-08-25',
        tax_month: '2026-08',
        payee_name: 'Vendor',
        income_type: 'ค่าบริการ',
        gross_amount: 2000,
        wht_amount: 60,
        certificate_no: '—',
        direction: 'outbound',
      },
      headOffice
    )
    const merged = mergeWhtCertificatesForPrint([a, b])
    expect(merged).toHaveLength(2)
  })
})
