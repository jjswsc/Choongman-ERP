import { describe, expect, it } from 'vitest'
import {
  buildMemberPortalTakeoutBarSubLabel,
  buildMemberPortalTakeoutDisplayLabel,
  buildMemberPortalTakeoutTableNameForStorage,
  resolveMemberPortalTakeoutMeta,
  resolveMemberPortalTakeoutTableDisplay,
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
})
