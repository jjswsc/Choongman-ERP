import { describe, expect, it } from 'vitest'
import { buildPnd1RdPrepReviewWorkbook } from './pnd1-rd-prep-xlsx'
import { pnd1LedgerToRdPrepTxt, splitPayeeAddressParts } from './pnd1-rd-prep-txt'
import { splitRdPrepGeoAddress } from './rd-prep-soft-attachment-txt'

describe('pnd1 rd prep exports', () => {
  const rows = [
    {
      payment_date: '2026-07-31',
      tax_month: '2026-07',
      store_name: 'CM MBK',
      payee_name: 'Test Employee',
      payee_tax_id: '1234567890123',
      income_type: '급여',
      wht_rate: 3,
      gross_amount: 15000,
      wht_amount: 450,
      certificate_no: 'PR1-202607-1',
      memo: '[AUTO:PAYROLL_RECORD_WHT:1] PND1',
      form_hint: 'PND1',
    },
  ]

  it('builds soft RD Prep pipe with empty address slots', () => {
    const txt = pnd1LedgerToRdPrepTxt(rows, { includeHeader: false })
    // |seq|tin||name|a1|a2|a3||||date|desc|rate|gross|wht|1
    expect(txt).toBe(
      '|1|1234567890123||Test Employee||||||||31/07/2026|급여 3%|3.0|15000.00|450.00|1'
    )
  })

  it('keeps address parts and four empty slots before date', () => {
    const txt = pnd1LedgerToRdPrepTxt(
      [
        {
          payment_date: '2026-06-19',
          payee_name: 'บริษัท วัฒนะ โกลด์ จำกัด',
          payee_tax_id: '0105560154864',
          payee_address: '12 ซอยสุขุมวิท 4 ถนนสุขุมวิท4 แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร',
          income_type: 'ค่าเช่า',
          wht_rate: 5,
          gross_amount: 500000,
          wht_amount: 25000,
        },
      ],
      { includeHeader: false }
    )
    expect(txt.startsWith('|1|0105560154864||บริษัท วัฒนะ โกลด์ จำกัด|')).toBe(true)
    expect(txt).toContain('|||||19/06/2026|ค่าเช่า 5%|5.0|500000.00|25000.00|1')
  })

  it('splits long address into up to 3 parts', () => {
    const [a1, a2, a3] = splitPayeeAddressParts(
      '12 ซอยสุขุมวิท 4 ถนนสุขุมวิท4 แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร'
    )
    expect(a1.length).toBeGreaterThan(0)
    expect(`${a1}${a2}${a3}`.replace(/\s/g, '').length).toBeGreaterThan(20)
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

describe('splitRdPrepGeoAddress', () => {
  it('keeps the street in ที่อยู่ and splits แขวง/เขต/จังหวัด/zip', () => {
    expect(
      splitRdPrepGeoAddress(
        '18 อาคารทรู ทาวเวอร์ ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310'
      )
    ).toEqual({
      line: '18 อาคารทรู ทาวเวอร์ ถนนรัชดาภิเษก',
      tambon: 'ห้วยขวาง',
      amphoe: 'ห้วยขวาง',
      province: 'กรุงเทพมหานคร',
      postcode: '10310',
    })
  })

  it('puts the full English address in ที่อยู่ when there is no Thai geo suffix', () => {
    expect(splitRdPrepGeoAddress('No. 55, 2nd Floor, Srinakarin Road')).toEqual({
      line: 'No. 55, 2nd Floor, Srinakarin Road',
      tambon: '',
      amphoe: '',
      province: '',
      postcode: '',
    })
  })
})
