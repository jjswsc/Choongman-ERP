import { describe, expect, it } from 'vitest'
import { buildPnd1RdPrepReviewWorkbook } from './pnd1-rd-prep-xlsx'
import { pnd1LedgerToRdPrepTxt } from './pnd1-rd-prep-txt'

describe('pnd1 rd prep exports', () => {
  const rows = [
    {
      payment_date: '2026-07-31',
      tax_month: '2026-07',
      store_name: 'CM MBK',
      payee_name: 'Test Employee',
      payee_tax_id: '1234567890123',
      income_type: '급여',
      gross_amount: 15000,
      wht_amount: 450,
      certificate_no: 'PR1-202607-1',
      memo: '[AUTO:PAYROLL_RECORD_WHT:1] PND1',
      form_hint: 'PND1',
    },
  ]

  it('builds pipe TXT with at least one data line', () => {
    const txt = pnd1LedgerToRdPrepTxt(rows, {
      payerTaxId: '0105566228126',
      payerBranchNo: '00000',
      payerName: 'Jinwon',
      includeHeader: true,
    })
    expect(txt.split(/\r?\n/).filter(Boolean).length).toBeGreaterThanOrEqual(2)
    expect(txt).toContain('Test Employee')
  })

  it('builds review workbook sheets', () => {
    const wb = buildPnd1RdPrepReviewWorkbook(rows, {
      payerTaxId: '0105566228126',
      payerBranchNo: '00000',
      payerName: 'Jinwon',
    })
    expect(wb.SheetNames).toEqual(['Summary', 'PND1', 'PipePreview'])
  })
})
