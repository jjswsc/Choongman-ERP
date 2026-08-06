import { describe, expect, it } from 'vitest'
import {
  formatWhtAgentDisplayName,
  resolveVendorPayeeForWht,
  resolveWhtCertificateParties,
  resolveWhtWithholdingAgentCompany,
  whtCertificateFromExpenseRegister,
  whtCertificateFromLedgerRow,
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
