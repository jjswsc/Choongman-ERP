import { describe, expect, it } from 'vitest'
import { isNoticeConfirmAction } from './notice-confirm-action'

describe('isNoticeConfirmAction', () => {
  it('accepts ko/th/en confirm labels', () => {
    expect(isNoticeConfirmAction('확인')).toBe(true)
    expect(isNoticeConfirmAction('ยืนยัน')).toBe(true)
    expect(isNoticeConfirmAction('รับทราบ')).toBe(true)
    expect(isNoticeConfirmAction('confirm')).toBe(true)
  })

  it('rejects later / empty', () => {
    expect(isNoticeConfirmAction('다음에')).toBe(false)
    expect(isNoticeConfirmAction('ไว้ก่อน')).toBe(false)
    expect(isNoticeConfirmAction('')).toBe(false)
  })
})
