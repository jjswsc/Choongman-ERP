import { describe, expect, it } from 'vitest'
import {
  buildMemberPortalTakeoutBarSubLabel,
  buildMemberPortalTakeoutDisplayLabel,
  buildMemberPortalTakeoutTableNameForStorage,
  formatMemberPortalReceiptMemo,
  isMemberPortalTakeoutKitchenOpen,
  isMemberPortalTakeoutOrder,
  resolveMemberPortalTakeoutMeta,
  resolveMemberPortalTakeoutTableDisplay,
  translateMemberPortalReceiptTableName,
} from '@/lib/pos-member-portal-takeout-label'

describe('pos-member-portal-takeout-label', () => {
  const memo =
    '[회원주문] · 회원 주문입니다 · 픽업희망:2025-06-03 15:30:00 · 회원:홍길동 · 번호:CM123456'

  it('parses member portal memo fields', () => {
    const meta = resolveMemberPortalTakeoutMeta({
      memo,
      memberId: 42,
      memberNo: 'CM123456',
    })
    expect(meta.isMemberPortal).toBe(true)
    expect(meta.memberName).toBe('홍길동')
    expect(meta.memberNo).toBe('CM123456')
    expect(meta.pickupAtRaw).toBe('2025-06-03 15:30:00')
  })

  it('builds storage table name and display label', () => {
    expect(buildMemberPortalTakeoutTableNameForStorage('홍길동', 'CM123456')).toBe(
      '회원주문 · 홍길동 · CM123456'
    )
    const meta = resolveMemberPortalTakeoutMeta({ memo, memberId: 1, memberNo: 'CM123456' })
    expect(buildMemberPortalTakeoutDisplayLabel(meta)).toBe('회원주문 · 홍길동 · CM123456')
  })

  it('synthesizes table display when table_name is empty', () => {
    expect(
      resolveMemberPortalTakeoutTableDisplay({
        tableName: '',
        memo,
        memberId: 1,
        memberNo: 'CM123456',
      })
    ).toBe('회원주문 · 홍길동 · CM123456')
  })

  it('builds bar sub label with order and pickup times', () => {
    const sub = buildMemberPortalTakeoutBarSubLabel({
      createdAt: '2025-06-03T07:00:00.000Z',
      pickupAtRaw: '2025-06-03 15:30:00',
      lang: 'ko',
    })
    expect(sub).toMatch(/주문/)
    expect(sub).toMatch(/픽업/)
    expect(sub).toMatch(/15:30/)
  })

  it('treats member portal paid takeout as kitchen-open', () => {
    const base = {
      type: 'takeout' as const,
      memo: '[회원주문] · 회원:홍길동 · 번호:CM1',
      memberId: 1,
      memberNo: 'CM1',
    }
    expect(isMemberPortalTakeoutOrder(base)).toBe(true)
    expect(isMemberPortalTakeoutKitchenOpen({ ...base, status: 'paid' })).toBe(true)
    expect(isMemberPortalTakeoutKitchenOpen({ ...base, status: 'ready' })).toBe(false)
    expect(isMemberPortalTakeoutKitchenOpen({ type: 'takeout', status: 'paid' })).toBe(false)
  })

  it('localizes member portal receipt memo and table for Thai POS', () => {
    const thT = (k: string) =>
      ({
        posMemberPortalOrder: 'สั่งซื้อสมาชิก',
        posMemberPortalOrderNotice: 'คำสั่งซื้อสมาชิก',
        posPickupAtShort: 'รับสินค้า',
        posMember: 'สมาชิก',
        posMemberNo: 'เลขสมาชิก',
      })[k] ?? k

    const localizedMemo = formatMemberPortalReceiptMemo(memo, thT, 'th')
    expect(localizedMemo).toContain('[สั่งซื้อสมาชิก]')
    expect(localizedMemo).toContain('คำสั่งซื้อสมาชิก')
    expect(localizedMemo).toContain('รับสินค้า:')
    expect(localizedMemo).not.toContain('회원 주문입니다')

    const table = translateMemberPortalReceiptTableName('회원주문 · ประวัตร · M007359', thT)
    expect(table).toBe('สั่งซื้อสมาชิก · ประวัตร · M007359')
  })
})
