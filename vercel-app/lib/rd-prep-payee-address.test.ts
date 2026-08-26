import { describe, expect, it } from 'vitest'
import {
  enrichLedgerRowsWithPayeeAddress,
  findPayeeMaster,
  normalizePersonNameKey,
  resolvePayeeAddressFromMasters,
} from './rd-prep-payee-address'

describe('rd-prep-payee-address', () => {
  const vendors = [
    {
      code: 'SVC1',
      name: 'รักษา วิจิตรโสภาพันธ์',
      taxId: '3101800833583',
      address: '99/1 ถ.สุขุมวิท แขวงคลองเตย เขตคลองเตย กรุงเทพมหานคร',
    },
    {
      code: 'TRUEH',
      name: 'บริษัท ทรู มูฟ เอช ยูนิเวอร์แซล คอมมิวนิเคชั่น จำกัด',
      taxId: '0105553045044',
      address: '18 อาคารทรู ทาวเวอร์',
    },
  ]
  const employees = [
    {
      name: 'สมณภูวดี พีพีช',
      taxId: '1199900538223',
      address: '12 ซอยลาดพร้าว 15 แขวงจอมพล เขตจตุจักร กรุงเทพมหานคร',
    },
    {
      name: 'ปิยวรรณ แสนทวีสุข',
      taxId: '1139900435246',
      address: '88 หมู่ 3 ต.บางรัก อ.เมือง จ.สมุทรปราการ',
    },
  ]

  it('strips Thai titles for person name matching', () => {
    expect(normalizePersonNameKey('นาย สมณภูวดี พีพีช')).toBe('สมณภูวดี พีพีช')
    expect(normalizePersonNameKey('น.ส.ปิยวรรณ แสนทวีสุข')).toBe('ปิยวรรณ แสนทวีสุข')
  })

  it('matches vendor by TIN even when names differ slightly', () => {
    const found = findPayeeMaster(vendors, { name: 'รักษา', taxId: '3 1018 00833 58 3' })
    expect(found?.address).toContain('สุขุมวิท')
  })

  it('fills empty ledger address from vendor TIN', () => {
    expect(
      resolvePayeeAddressFromMasters(
        { payee_name: 'รักษา วิจิตรโสภาพันธ์', payee_tax_id: '3101800833583' },
        { vendors, employees }
      )
    ).toContain('สุขุมวิท')
  })

  it('fills empty ledger address from employee name with title', () => {
    expect(
      resolvePayeeAddressFromMasters(
        { payee_name: 'นาย สมณภูวดี พีพีช', payee_tax_id: '1199900538223' },
        { vendors, employees }
      )
    ).toContain('ลาดพร้าว')
  })

  it('keeps an address already on the ledger row', () => {
    expect(
      resolvePayeeAddressFromMasters(
        {
          payee_name: 'รักษา วิจิตรโสภาพันธ์',
          payee_tax_id: '3101800833583',
          payee_address: 'ที่อยู่ที่บันทึกไว้แล้ว',
        },
        { vendors, employees }
      )
    ).toBe('ที่อยู่ที่บันทึกไว้แล้ว')
  })

  it('enriches PND3 rows used by RD Prep soft TXT', () => {
    const enriched = enrichLedgerRowsWithPayeeAddress(
      [
        { payee_name: 'รักษา วิจิตรโสภาพันธ์', payee_tax_id: '3101800833583' },
        { payee_name: 'น.ส.ปิยวรรณ แสนทวีสุข', payee_tax_id: '1139900435246' },
      ],
      { vendors, employees }
    )
    expect(enriched[0]?.payee_address).toContain('สุขุมวิท')
    expect(enriched[1]?.payee_address).toContain('สมุทรปราการ')
  })
})
