import { describe, expect, it } from 'vitest'
import {
  buildMemberPointLineFlexMessage,
  formatBangkokThaiBuddhistDateTime,
  formatMemberLineHonorificName,
  formatMemberPointLineOrderAmount,
  memberPointLineBranchLabel,
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
    expect(formatBangkokThaiBuddhistDateTime(at)).toBe('8 ก.ย. 2569 · 15:06 น.')
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
    expect(flex.altText).toContain('คุณได้รับแต้มแล้ว')
    expect(flex.altText).toContain('+20')
    expect(flex.contents.type).toBe('bubble')
    const json = JSON.stringify(flex.contents)
    expect(json).toContain('CHOONGMAN')
    expect(json).toContain('REWARDS')
    expect(json).toContain('สวัสดี คุณประวัตร')
    expect(json).toContain('คุณได้รับแต้มแล้ว')
    expect(json).toContain('+20')
    expect(json).toContain('แต้มสะสม')
    expect(json).toContain('ซื้อสินค้าที่ร้าน')
    expect(json).toContain('รายการ')
    expect(json).toContain('60')
    expect(json).toContain('แต้มคงเหลือ')
    expect(json).toContain('8 ก.ย. 2569 · 15:06 น.')
    expect(json).toContain('ขอบคุณที่อร่อยไปด้วยกัน')
    expect(json).toContain('#E8F6EE')
  })

  it('shows tier, order amount, and office branch like the rewards card', () => {
    const flex = buildMemberPointLineFlexMessage({
      earned: 7.02,
      used: 0,
      balanceAfter: 2954.15,
      tierCode: 'DIAMOND',
      storeCode: 'CM Office',
      orderAmount: 234,
      memberName: 'ประวัตร',
      occurredAt: new Date('2026-10-06T08:11:00.000Z'),
    })
    const json = JSON.stringify(flex.contents)
    expect(json).toContain('+7.02')
    expect(json).toContain('2,954.15')
    expect(json).toContain('DIAMOND')
    expect(json).toContain('ระดับสมาชิก')
    expect(json).toContain('B 234.00')
    expect(json).toContain('ยอดคำสั่งซื้อ')
    expect(json).toContain('Online (Office)')
    expect(json).toContain('สาขา')
    expect(json).toContain('6 ต.ค. 2569 · 15:11 น.')
  })
})

describe('member point card labels', () => {
  it('labels the head office branch as Online (Office)', () => {
    expect(memberPointLineBranchLabel('CM Office')).toBe('Online (Office)')
    expect(memberPointLineBranchLabel('CM Silom', 'สีลม')).toBe('สีลม')
  })

  it('formats the order amount with a B prefix and 2 decimals', () => {
    expect(formatMemberPointLineOrderAmount(234)).toBe('B 234.00')
  })
})
