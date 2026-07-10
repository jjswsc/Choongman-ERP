import { describe, expect, it } from 'vitest'
import { buildMemberPointLineFlexMessage } from '@/lib/member-point-line-flex'
import { buildMemberPointLineNotifyText } from '@/lib/member-point-line-notify'

describe('buildMemberPointLineNotifyText', () => {
  it('formats earn message in Thai', () => {
    const text = buildMemberPointLineNotifyText({
      earned: 25.5,
      used: 0,
      balanceAfter: 640,
      tierCode: 'DIAMOND',
      storeCode: 'TDP',
      orderNo: 'POS-1001',
    })
    expect(text).toContain('ได้รับพอยท์ +25.5')
    expect(text).toContain('พอยท์คงเหลือ 640')
    expect(text).toContain('ระดับสมาชิก DIAMOND')
    expect(text).toContain('TDP · POS-1001')
  })

  it('includes use line when points were spent', () => {
    const text = buildMemberPointLineNotifyText({
      earned: 0,
      used: 100,
      balanceAfter: 140,
      tierCode: 'BRONZE',
    })
    expect(text).toContain('ใช้พอยท์ -100')
    expect(text).not.toContain('ได้รับพอยท์')
  })
})

describe('buildMemberPointLineFlexMessage', () => {
  it('builds flex bubble with earn headline', () => {
    const flex = buildMemberPointLineFlexMessage({
      earned: 2.59,
      used: 0,
      balanceAfter: 640,
      tierCode: 'DIAMOND',
      storeCode: 'TDP',
      orderNo: 'POS-1001',
    })
    expect(flex.altText).toContain('ได้รับพอยท์')
    expect(flex.altText).toContain('+2.59')
    expect(flex.contents.type).toBe('bubble')
    const body = flex.contents.body as { contents?: unknown[] }
    expect(Array.isArray(body?.contents)).toBe(true)
  })
})
