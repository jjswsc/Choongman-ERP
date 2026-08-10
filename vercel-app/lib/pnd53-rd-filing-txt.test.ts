import { describe, expect, it } from 'vitest'
import { buildRdFilingRdxFilename } from '@/lib/rd-filing-common'
import { pnd53LedgerToRdFilingTxt } from '@/lib/pnd53-rd-filing-txt'

describe('pnd53-rd-filing-txt', () => {
  it('builds header and detail with pipe delimiter', () => {
    const txt = pnd53LedgerToRdFilingTxt(
      [
        {
          payment_date: '2025-06-15',
          payee_name: 'บริษัท ทดสอบ จำกัด',
          payee_tax_id: '0123456789012',
          income_type: 'ค่าบริการ',
          gross_amount: 1000,
          wht_rate: 3,
          wht_amount: 30,
          form_hint: 'PND53',
        },
      ],
      {
        payerTaxId: '0105566137147',
        payerBranchNo: '00000',
        taxMonth: '2025-06',
        rdUserId: 'testuser',
      },
      'PND53'
    )
    const lines = txt.split('\r\n').filter(Boolean)
    expect(lines[0]?.startsWith('H|')).toBe(true)
    expect(lines[0]).toContain('PND53')
    expect(lines.some((l) => l.startsWith('D|'))).toBe(true)
  })

  it('auto-classifies empty form_hint by payee (PND3 vs PND53)', () => {
    const rows = [
      {
        payment_date: '2025-06-15',
        payee_name: 'นายสมชาย ใจดี',
        payee_tax_id: '3101800833583',
        income_type: 'ค่าบริการ',
        gross_amount: 1000,
        wht_rate: 3,
        wht_amount: 30,
        form_hint: '',
      },
      {
        payment_date: '2025-06-16',
        payee_name: 'Polonext Co., Ltd.',
        payee_tax_id: '0105561000000',
        income_type: 'ค่าบริการ',
        gross_amount: 2000,
        wht_rate: 3,
        wht_amount: 60,
        form_hint: '',
      },
      {
        payment_date: '2025-06-17',
        payee_name: 'พนักงาน A',
        payee_tax_id: '3101800833583',
        income_type: '급여',
        gross_amount: 15000,
        wht_rate: 1,
        wht_amount: 100,
        form_hint: 'PND1',
      },
    ]
    const pnd3 = pnd53LedgerToRdFilingTxt(
      rows,
      { payerTaxId: '0105566137147', payerBranchNo: '00000', taxMonth: '2025-06' },
      'PND3'
    )
    const pnd53 = pnd53LedgerToRdFilingTxt(
      rows,
      { payerTaxId: '0105566137147', payerBranchNo: '00000', taxMonth: '2025-06' },
      'PND53'
    )
    expect(pnd3).toContain('สมชาย ใจดี')
    expect(pnd3).not.toContain('Polonext')
    expect(pnd3).not.toContain('พนักงาน A')
    expect(pnd53).toContain('Polonext')
    expect(pnd53).not.toContain('สมชาย ใจดี')
    expect(pnd53).not.toContain('พนักงาน A')
  })
})

describe('rd-filing rdx filename', () => {
  it('matches sample PP30 pattern', () => {
    expect(
      buildRdFilingRdxFilename({
        taxId13: '0105566137147',
        formCode: '30',
        taxMonth: '2026-06',
        branchNo6: '000000',
      })
    ).toBe('0105566137147V00000P302569060000-010100.rdx')
  })
})
