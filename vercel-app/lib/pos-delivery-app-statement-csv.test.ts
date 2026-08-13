import { describe, expect, it } from 'vitest'
import {
  compareMerchantStatementToErp,
  parseMerchantStatementCsv,
  parseMerchantStatementDate,
  summarizeStatementCompare,
} from '@/lib/pos-delivery-app-statement-csv'

const GRAB_HEADER = [
  'ชื่อร้าน',
  'Merchant ID',
  'ชื่อร้าน',
  'รหัสร้านค้า',
  'Updated On',
  'วันที่สร้าง',
  'ประเภท',
  'หมวดหมู่',
  'รายการย่อย',
  'สถานะ',
  'รหัสคำสั่งซื้อสั้น',
  'ยอดขายสุทธิ',
  'ทั้งหมด',
].join(',')

function grabLine(params: {
  created: string
  category: string
  sub?: string
  shortId: string
  net: number
}) {
  return [
    'บริษัท',
    'mid',
    'Choongman Chicken Union Mall',
    'sid',
    params.created,
    params.created,
    'GrabFood',
    params.category,
    params.sub ?? '',
    'โอนแล้ว',
    params.shortId,
    String(params.net),
    String(params.net),
  ].join(',')
}

describe('parseMerchantStatementDate', () => {
  it('parses Grab Thai export datetime', () => {
    expect(parseMerchantStatementDate('31 Jul 2026 9:17 PM')).toBe('2026-07-31')
    expect(parseMerchantStatementDate('1 Jul 2026 10:29 AM')).toBe('2026-07-01')
  })
})

describe('parseMerchantStatementCsv', () => {
  it('splits Grab delivery, dine, and chargeback by day', () => {
    const csv = [
      GRAB_HEADER,
      grabLine({ created: '23 Jul 2026 8:00 PM', category: 'ชำระเงิน', shortId: 'GF-1', net: 100 }),
      grabLine({ created: '23 Jul 2026 9:00 PM', category: 'ชำระเงิน', shortId: 'GF-2', net: 200 }),
      grabLine({
        created: '23 Jul 2026 6:00 PM',
        category: 'ส่วนลดหน้าร้าน',
        shortId: 'GD-AAA',
        net: 515,
      }),
      grabLine({
        created: '23 Jul 2026 5:00 PM',
        category: 'การปรับรายได้',
        sub: 'หักเงินเพื่อชดเชยผู้สั่งซื้อ',
        shortId: 'GF-9',
        net: -30,
      }),
      grabLine({ created: '26 Jul 2026 1:00 PM', category: 'ชำระเงิน', shortId: 'GF-3', net: 50 }),
    ].join('\n')
    const parsed = parseMerchantStatementCsv(csv)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.app).toBe('grab')
    expect(parsed.totals.deliveryCount).toBe(3)
    expect(parsed.totals.deliverySales).toBe(350)
    expect(parsed.totals.inStoreCount).toBe(1)
    expect(parsed.totals.inStoreSales).toBe(515)
    expect(parsed.totals.adjustSales).toBe(-30)
    const d23 = parsed.days.find((d) => d.date === '2026-07-23')
    expect(d23?.deliverySales).toBe(300)
    expect(d23?.inStoreSales).toBe(515)
  })

  it('rejects unrecognized csv', () => {
    const parsed = parseMerchantStatementCsv('a,b\n1,2\n')
    expect(parsed.ok).toBe(false)
  })
})

describe('compareMerchantStatementToErp', () => {
  it('flags mismatched dates and keeps matching days', () => {
    const csv = parseMerchantStatementCsv(
      [
        GRAB_HEADER,
        grabLine({ created: '23 Jul 2026 8:00 PM', category: 'ชำระเงิน', shortId: 'GF-1', net: 100 }),
        grabLine({ created: '26 Jul 2026 1:00 PM', category: 'ชำระเงิน', shortId: 'GF-3', net: 50 }),
        grabLine({ created: '27 Jul 2026 1:00 PM', category: 'ชำระเงิน', shortId: 'GF-4', net: 80 }),
      ].join('\n')
    )
    expect(csv.ok).toBe(true)
    if (!csv.ok) return
    const days = compareMerchantStatementToErp(csv.days, [
      { date: '2026-07-23', deliveryCount: 1, deliverySales: 100, inStoreCount: 0, inStoreSales: 0 },
      { date: '2026-07-26', deliveryCount: 1, deliverySales: 41, inStoreCount: 0, inStoreSales: 0 },
      { date: '2026-07-28', deliveryCount: 1, deliverySales: 10, inStoreCount: 0, inStoreSales: 0 },
    ])
    const byDate = Object.fromEntries(days.map((d) => [d.date, d]))
    expect(byDate['2026-07-23']?.status).toBe('match')
    expect(byDate['2026-07-26']?.status).toBe('mismatch')
    expect(byDate['2026-07-26']?.deliverySalesDiff).toBe(9)
    expect(byDate['2026-07-27']?.status).toBe('csv_only')
    expect(byDate['2026-07-28']?.status).toBe('erp_only')
    const sum = summarizeStatementCompare(days)
    expect(sum.match).toBe(1)
    expect(sum.mismatch).toBe(1)
    expect(sum.mismatchDates).toEqual(['2026-07-26', '2026-07-27', '2026-07-28'])
  })
})
