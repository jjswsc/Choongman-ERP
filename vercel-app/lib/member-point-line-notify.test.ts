import { describe, expect, it } from 'vitest'
import {
  buildMemberPointLineFlexMessage,
  formatBangkokThaiBuddhistDateTime,
  formatMemberLineHonorificName,
} from '@/lib/member-point-line-flex'
import { buildMemberPointLineNotifyText } from '@/lib/member-point-line-notify'

describe('buildMemberPointLineNotifyText', () => {
  it('formats earn message in Thai with honorific and reason', () => {
    const text = buildMemberPointLineNotifyText({
      earned: 20,
      used: 0,
      balanceAfter: 60,
      tierCode: 'DIAMOND',
      storeCode: 'TDP',
      orderNo: 'POS-1001',
      memberName: 'ประวัตร',
    })
    expect(text).toContain('Choongman Chicken 🍗')
    expect(text).toContain('คุณประวัตร')
    expect(text).toContain('ได้รับ 20 แต้ม')
    expect(text).toContain('เหตุผล: ซื้อสินค้าที่ร้าน')
    expect(text).toContain('แต้มคงเหลือ: 60 แต้ม')
    expect(text).toContain('ขอบคุณที่ใช้บริการครับ')
    expect(text).not.toContain('ค่ะ')
  })

  it('includes use line when points were spent', () => {
    const text = buildMemberPointLineNotifyText({
      earned: 0,
      used: 100,
      balanceAfter: 140,
      tierCode: 'BRONZE',
    })
    expect(text).toContain('ใช้ 100 แต้ม')
    expect(text).toContain('เหตุผล: ใช้แต้มที่ร้าน')
    expect(text).not.toContain('ได้รับ')
  })
})

describe('formatBangkokThaiBuddhistDateTime', () => {
  it('formats Bangkok time in Thai Buddhist era like 8 ก.ย. 2569 15:06', () => {
    const at = new Date('2026-09-08T08:06:00.000Z')
    expect(formatBangkokThaiBuddhistDateTime(at)).toBe('8 ก.ย. 2569 15:06')
  })
})

describe('formatMemberLineHonorificName', () => {
  it('strips existing คุณ prefix', () => {
    expect(formatMemberLineHonorificName('คุณประวัตร')).toBe('ประวัตร')
    expect(formatMemberLineHonorificName(' ประวัตร ')).toBe('ประวัตร')
  })
})

describe('buildMemberPointLineFlexMessage', () => {
  it('builds CHOONGMAN REWARDS earn card', () => {
    const flex = buildMemberPointLineFlexMessage({
      earned: 20,
      used: 0,
      balanceAfter: 60,
      memberName: 'ประวัตร',
      occurredAt: new Date('2026-09-08T08:06:00.000Z'),
    })
    expect(flex.altText).toContain('สวัสดี คุณประวัตร')
    expect(flex.altText).toContain('คุณได้รับแต้ม')
    expect(flex.altText).toContain('+20 แต้ม')
    expect(flex.contents.type).toBe('bubble')
    const json = JSON.stringify(flex.contents)
    expect(json).toContain('CHOONGMAN')
    expect(json).toContain('REWARDS')
    expect(json).toContain('สวัสดี คุณประวัตร')
    expect(json).toContain('คุณได้รับแต้ม')
    expect(json).toContain('+20 แต้ม')
    expect(json).toContain('ซื้อสินค้าที่ร้าน')
    expect(json).toContain('60 แต้ม')
    expect(json).toContain('8 ก.ย. 2569 15:06')
    expect(json).toContain('ขอบคุณที่ใช้บริการ Choongman Chicken')
  })
})
