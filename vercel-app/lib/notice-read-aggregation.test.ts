import { describe, expect, it } from 'vitest'
import {
  aggregateNoticeReadStats,
  isPurchaseOrderDecisionNotice,
  type EmpRow,
  type NoticeForAggregation,
} from './notice-read-aggregation'

const notice = (id: number, overrides?: Partial<NoticeForAggregation>): NoticeForAggregation => ({
  id,
  title: `n${id}`,
  content: 'x',
  sender: 'HQ',
  created_at: '2026-08-01T03:00:00+07:00',
  target_store: '전체',
  target_role: '전체',
  ...overrides,
})

describe('isPurchaseOrderDecisionNotice', () => {
  it('hides Korean PO approval titles that flood the store inbox', () => {
    expect(
      isPurchaseOrderDecisionNotice('주문 #2650 승인되었습니다', 'The Street 발주가 승인되었습니다.')
    ).toBe(true)
    expect(isPurchaseOrderDecisionNotice('주문 #2649 반려되었습니다', '사유: 재고')).toBe(true)
    expect(isPurchaseOrderDecisionNotice('주문 #1 보류되었습니다', '추가 확인 후 진행 예정입니다.')).toBe(
      true
    )
  })

  it('hides Thai translated PO approval titles from the screenshot', () => {
    expect(isPurchaseOrderDecisionNotice('คำสั่งซื้อ #2650 ได้รับการอนุมัติแล้ว', '')).toBe(true)
  })

  it('keeps HQ office announcements', () => {
    expect(isPurchaseOrderDecisionNotice('แจ้งปรับราคาไก่ S Size (หน้าร้าน/Delivery)', '')).toBe(false)
    expect(isPurchaseOrderDecisionNotice('ประกาศเรื่องแก้ไข Sticker', 'ราคาในเล่มเมนู')).toBe(false)
    expect(isPurchaseOrderDecisionNotice('แจ้งเกี่ยวกับกิจกรรม "สุ่มได้งาน"', '')).toBe(false)
  })
})

describe('aggregateNoticeReadStats resign filter', () => {
  it('keeps employees with future resign date in roster', () => {
    const employees: EmpRow[] = [
      { store: 'S1', name: 'Future', job: 'Staff', role: 'Staff', resignDate: '2026-12-31' },
      { store: 'S1', name: 'Past', job: 'Staff', role: 'Staff', resignDate: '2026-07-01' },
      { store: 'S1', name: 'Active', job: 'Staff', role: 'Staff', resignDate: '' },
    ]
    const map = aggregateNoticeReadStats([notice(1)], employees, [], {
      searchType: 'all',
      asOfYmd: '2026-08-10',
    })
    expect(map.has('S1|Future')).toBe(true)
    expect(map.has('S1|Active')).toBe(true)
    expect(map.has('S1|Past')).toBe(false)
  })
})
