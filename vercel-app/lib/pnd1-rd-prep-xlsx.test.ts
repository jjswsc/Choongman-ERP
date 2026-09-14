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
    // |seq|tin||title|first|middle|last|addr...|date|มาตรา|rate|gross|wht|1
    expect(txt).toBe(
      '|1|1234567890123|||Test||Employee||||||||31/07/2026|เงินได้ตามมาตรา 40(1) เงินเดือน ค่าจ้าง ฯลฯ กรณีได้รับอนุมัติจากกรมฯ ให้หักอัตราร้อยละ 3|3.0|15000.00|450.00|1'
    )
  })

  it('splits first and last name and uses มาตรา 40(1) without a tax rate in the description', () => {
    const txt = pnd1LedgerToRdPrepTxt(
      [
        {
          payment_date: '2026-08-31',
          payee_name: 'Akkarawat Phuw',
          payee_tax_id: '1400600186754',
          income_type: 'เงินเดือน',
          wht_rate: 0,
          gross_amount: 20000,
          wht_amount: 0,
        },
      ],
      { includeHeader: false }
    )
    expect(txt).toContain('|Akkarawat||Phuw|')
    expect(txt).toContain('เงินได้ตามมาตรา 40(1) เงินเดือน ค่าจ้าง ฯลฯ กรณีทั่วไป')
    expect(txt).not.toContain('กรณีทั่วไป 0%')
    expect(txt).not.toContain('|Akkarawat Phuw|')
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
