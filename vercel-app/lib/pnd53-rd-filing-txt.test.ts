import { describe, expect, it } from 'vitest'
import { buildRdFilingRdxFilename, buildRdFilingTxtFilename, isoToRdBeDate8, splitThaiPayeeName } from '@/lib/rd-filing-common'
import {
  PND53_RD_DETAIL_FIELD_COUNT,
  PND53_RD_HEADER_FIELD_COUNT,
  buildPnd353RdPrepSoftFilename,
  pnd53LedgerToRdFilingTxt,
  pnd53LedgerToRdPrepSoftTxt,
  toPnd53IncomeTypeLabel,
} from '@/lib/pnd53-rd-filing-txt'

const payer = {
  payerTaxId: '0105566137147',
  payerBranchNo: '00000',
  taxMonth: '2025-06',
  rdUserId: 'testuser',
}

const companyRow = {
  payment_date: '2025-06-15',
  payee_name: 'บริษัท ทดสอบ จำกัด',
  payee_tax_id: '0123456789012',
  income_type: 'ค่าบริการ',
  gross_amount: 1000,
  wht_rate: 3,
  wht_amount: 30,
  form_hint: 'PND53',
}

function pipeFields(line: string): string[] {
  return line.split('|')
}

describe('pnd53 Format กลาง v2.0', () => {
  it('uses Buddhist ddmmyyyy for payment date', () => {
    expect(isoToRdBeDate8('2025-06-15')).toBe('15062568')
  })

  it('splits juristic payee into TITLE + name without repeating บริษัท', () => {
    expect(splitThaiPayeeName('บริษัท ทดสอบ จำกัด')).toEqual({
      titleName: 'บริษัท',
      firstName: 'ทดสอบ จำกัด',
      middleName: '',
      surName: '',
    })
  })

  it('maps Korean/English income labels to Thai form wording', () => {
    expect(toPnd53IncomeTypeLabel('서비스')).toBe('ค่าบริการ')
    expect(toPnd53IncomeTypeLabel('로열티·용역 수입')).toBe('ค่าสิทธิ')
    expect(toPnd53IncomeTypeLabel('ค่าเช่าอาคาร')).toBe('ค่าเช่าอาคาร')
  })

  it('builds H/D records with spec field counts, amounts, and empty slot dates', () => {
    const txt = pnd53LedgerToRdFilingTxt([companyRow], payer, 'PND53')
    const lines = txt.split('\r\n').filter(Boolean)
    expect(lines).toHaveLength(2)

    const header = pipeFields(lines[0]!)
    expect(header).toHaveLength(PND53_RD_HEADER_FIELD_COUNT)
    expect(header[0]).toBe('H')
    expect(header[1]).toBe('0000')
    expect(header[2]).toBe('0105566137147')
    expect(header[3]).toBe('000000')
    expect(header[4]).toBe('1')
    expect(header[5]).toBe('PND53')
    expect(header[6]).toBe('0105566137147')
    expect(header[7]).toBe('000000')
    expect(header[8]).toBe('สำนักงานใหญ่')
    expect(header[13]).toBe('06')
    expect(header[14]).toBe('2568')
    expect(header[15]).toBe('V')
    expect(header[16]).toBe('00')
    expect(header[17]).toBe('1')
    expect(header[18]).toBe('1000.00')
    expect(header[19]).toBe('30.00')
    expect(header[20]).toBe('0.00')
    expect(header[21]).toBe('30.00')
    expect(header[22]).toBe('0.00')
    expect(header[23]).toBe('testuser')
    expect(header[24]).toBe('2')
    expect(lines[0]?.startsWith('|')).toBe(false)

    const detail = pipeFields(lines[1]!)
    expect(detail).toHaveLength(PND53_RD_DETAIL_FIELD_COUNT)
    expect(detail[0]).toBe('D')
    expect(detail[1]).toBe('1')
    expect(detail[2]).toBe('000000')
    expect(detail[3]).toBe('0123456789012')
    expect(detail[4]).toBe('0123456789')
    expect(detail[5]).toBe('บริษัท')
    expect(detail[6]).toBe('ทดสอบ จำกัด')
    expect(detail[7]).toBe('')
    expect(detail[8]).toBe('15062568')
    expect(detail[9]).toBe('3.00')
    expect(detail[10]).toBe('1000.00')
    expect(detail[11]).toBe('30.00')
    expect(detail[12]).toBe('ค่าบริการ')
    expect(detail[13]).toBe('1')
    expect(detail[14]).toBe('00000000')
    expect(detail[15]).toBe('0.00')
    expect(detail[20]).toBe('00000000')
    expect(detail[21]).toBe('0.00')
  })

  it('keeps more than 6 payments for the same payee (3 slots per seq)', () => {
    const rows = Array.from({ length: 7 }, (_, i) => ({
      ...companyRow,
      payment_date: `2025-06-${String(10 + i).padStart(2, '0')}`,
      gross_amount: 1000 + i,
      wht_amount: 30 + i,
    }))
    const txt = pnd53LedgerToRdFilingTxt(rows, payer, 'PND53')
    const details = txt.split('\r\n').filter((l) => l.startsWith('D|'))
    expect(details).toHaveLength(3)
    expect(details[2]).toContain('16062568')
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
    const pnd3 = pnd53LedgerToRdFilingTxt(rows, payer, 'PND3')
    const pnd53 = pnd53LedgerToRdFilingTxt(rows, payer, 'PND53')
    expect(pnd3).toContain('สมชาย')
    expect(pnd3).toContain('ใจดี')
    expect(pnd3).toMatch(/นาย\|สมชาย\|ใจดี/)
    expect(pnd3).not.toContain('Polonext')
    expect(pnd3).not.toContain('พนักงาน A')
    expect(pnd53).toContain('Polonext')
    expect(pnd53).not.toContain('|สมชาย|')
    expect(pnd53).not.toContain('พนักงาน A')
  })

  it('builds official filename PND53_NID_BRANCH_YEAR_MONTH_FORM_SEND.txt', () => {
    expect(
      buildRdFilingTxtFilename({
        taxType: 'PND53',
        taxId13: '0105566137147',
        taxMonth: '2025-06',
        branchNo6: '000000',
      })
    ).toBe('PND53_0105566137147_000000_2568_06_00_00.txt')
  })
})

describe('pnd53-rd-prep-soft (mapping fallback)', () => {
  it('builds soft RD Prep attachment with empty slots', () => {
    const soft = pnd53LedgerToRdPrepSoftTxt(
      [
        {
          payment_date: '2026-06-19',
          payee_name: 'บริษัท วัฒนะ โกลด์ จำกัด',
          payee_tax_id: '0105560154864',
          income_type: 'ค่าเช่า',
          gross_amount: 500000,
          wht_rate: 5,
          wht_amount: 25000,
          form_hint: 'PND53',
        },
      ],
      'PND53'
    )
    expect(soft).toBe(
      '|1|0105560154864||บริษัท วัฒนะ โกลด์ จำกัด||||||||19/06/2026|ค่าเช่า 5%|5.0|500000.00|25000.00|1'
    )
  })

  it('keeps PND3 people out of the PND53 soft file', () => {
    const soft = pnd53LedgerToRdPrepSoftTxt(
      [
        {
          payment_date: '2026-06-19',
          payee_name: 'บริษัท วัฒนะ โกลด์ จำกัด',
          payee_tax_id: '0105560154864',
          income_type: 'ค่าเช่า',
          gross_amount: 500000,
          wht_rate: 5,
          wht_amount: 25000,
          form_hint: 'PND53',
        },
        {
          payment_date: '2026-06-20',
          payee_name: 'นายสมชาย ใจดี',
          payee_tax_id: '3101800833583',
          income_type: 'ค่าบริการ',
          gross_amount: 1000,
          wht_rate: 3,
          wht_amount: 30,
          form_hint: 'PND3',
        },
      ],
      'PND53'
    )
    expect(soft).toContain('วัฒนะ โกลด์')
    expect(soft).not.toContain('สมชาย')
  })

  it('names PND3 files without a pnd53 prefix', () => {
    expect(buildPnd353RdPrepSoftFilename('PND3', '2026-08')).toBe('pnd3-rd-prep-soft-2026-08.txt')
    expect(buildPnd353RdPrepSoftFilename('PND53', '2026-08')).toBe('pnd53-rd-prep-soft-2026-08.txt')
    expect(buildPnd353RdPrepSoftFilename('ALL', '2026-08')).toBe('pnd3-pnd53-rd-prep-soft-2026-08.txt')
  })

  it('puts PND53 company address into the ที่อยู่ slot after the name', () => {
    const soft = pnd53LedgerToRdPrepSoftTxt(
      [
        {
          payment_date: '2026-08-06',
          payee_name: 'บริษัท ทรู อินเทอร์เน็ต คอร์ปอเรชั่น จำกัด',
          payee_tax_id: '0105549025026',
          payee_address: '18 อาคารทรู ทาวเวอร์ ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
          income_type: 'ค่าบริการ',
          gross_amount: 10000,
          wht_rate: 3,
          wht_amount: 300,
          form_hint: 'PND53',
        },
      ],
      'PND53'
    )
    expect(soft).toContain('|บริษัท ทรู อินเทอร์เน็ต คอร์ปอเรชั่น จำกัด|')
    expect(soft).not.toContain('|บริษัท|ทรู อินเทอร์เน็ต คอร์ปอเรชั่น จำกัด|')
    expect(soft).toContain('|18 อาคารทรู ทาวเวอร์ ถนนรัชดาภิเษก|')
    expect(soft).toContain('|ห้วยขวาง|ห้วยขวาง|กรุงเทพมหานคร|10310|')
    expect(soft.includes('||||||||||06/08/2026')).toBe(false)
  })

  it('keeps PND53 ถนน on Col6 so the company name is not used as the road', () => {
    const soft = pnd53LedgerToRdPrepSoftTxt(
      [
        {
          payment_date: '2026-08-06',
          payee_name: 'บริษัท วันไลฟ์ กราฟฟิก จำกัด',
          payee_tax_id: '0115559009368',
          payee_address: '99/1 ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
          income_type: 'ค่าบริการ',
          gross_amount: 10000,
          wht_rate: 3,
          wht_amount: 300,
          form_hint: 'PND53',
        },
      ],
      'PND53'
    )
    const cols = soft.split('|')
    // RD Prep Col N = split[N-1] (leading `|` = Col1). ถนน=Col6, ตำบล=Col7, อำเภอ=Col8
    expect(cols[4]).toBe('บริษัท วันไลฟ์ กราฟฟิก จำกัด')
    expect(cols[5]).toBe('99/1 ถนนรัชดาภิเษก')
    expect(cols[6]).toBe('ห้วยขวาง')
    expect(cols[7]).toBe('ห้วยขวาง')
    expect(cols[5]).not.toContain('วันไลฟ์')
  })

  it('does not put PND53 company names into the road column when formHint is ALL', () => {
    const soft = pnd53LedgerToRdPrepSoftTxt(
      [
        {
          payment_date: '2026-08-06',
          payee_name: 'นายสมชาย ใจดี',
          payee_tax_id: '3101800833583',
          income_type: 'ค่าบริการ',
          gross_amount: 1000,
          wht_rate: 3,
          wht_amount: 30,
          form_hint: 'PND3',
        },
        {
          payment_date: '2026-08-06',
          payee_name: 'บริษัท วันไลฟ์ กราฟฟิก จำกัด',
          payee_tax_id: '0115559009368',
          payee_address: '99/1 ถนนรัชดาภิเษก แขวงห้วยขวาง เขตห้วยขวาง กรุงเทพมหานคร 10310',
          income_type: 'ค่าบริการ',
          gross_amount: 10000,
          wht_rate: 3,
          wht_amount: 300,
          form_hint: 'PND53',
        },
      ],
      'ALL'
    )
    const pnd53Line = soft.split('\r\n').find((l) => l.includes('0115559009368')) || ''
    const cols = pnd53Line.split('|')
    expect(cols[4]).toBe('บริษัท วันไลฟ์ กราฟฟิก จำกัด')
    expect(cols[5]).toBe('99/1 ถนนรัชดาภิเษก')
    expect(cols[5]).not.toContain('วันไลฟ์')
    expect(soft).toContain('|นาย|สมชาย||ใจดี|')
  })

  it('puts payee address into RD Prep soft attachment slots', () => {
    const soft = pnd53LedgerToRdPrepSoftTxt(
      [
        {
          payment_date: '2026-08-06',
          payee_name: 'รักษา วิจิตรโสภาพันธ์',
          payee_tax_id: '3101800833583',
          payee_address: '99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร',
          income_type: 'ค่าบริการ',
          gross_amount: 19500,
          wht_rate: 3,
          wht_amount: 585,
          form_hint: 'PND3',
        },
      ],
      'PND3'
    )
    expect(soft).toContain('|รักษา|')
    expect(soft).toContain('|วิจิตรโสภาพันธ์|')
    expect(soft).not.toContain('|รักษา วิจิตรโสภาพันธ์|')
    expect(soft).toContain('สุขุมวิท')
    expect(soft).toContain('|คลองเตย|คลองเตย|กรุงเทพมหานคร|')
    expect(soft).toContain('06/08/2026')
    expect(soft.includes('||||||||06/08/2026')).toBe(false)
  })

  it('splits PND3 title, given name and surname into RD Prep columns', () => {
    const soft = pnd53LedgerToRdPrepSoftTxt(
      [
        {
          payment_date: '2026-08-06',
          payee_name: 'น.ส.ปิยวรรณ แสนทวีสุข',
          payee_tax_id: '1139900435246',
          income_type: 'ค่าบริการ',
          gross_amount: 10000,
          wht_rate: 3,
          wht_amount: 300,
          form_hint: 'PND3',
        },
      ],
      'PND3'
    )
    expect(soft).toBe(
      '|1|1139900435246||น.ส.|ปิยวรรณ||แสนทวีสุข||||||||06/08/2026|ค่าบริการ 3%|3.0|10000.00|300.00|1'
    )
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
