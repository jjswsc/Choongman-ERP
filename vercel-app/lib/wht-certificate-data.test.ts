import { describe, expect, it } from 'vitest'
import {
  resolveVendorPayeeForWht,
  resolveWhtCertificateParties,
  whtCertificateFromExpenseRegister,
  whtCertificateFromLedgerRow,
} from '@/lib/wht-certificate-data'

const headOffice = {
  companyName: 'S&J GLOBAL CO., LTD.',
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
